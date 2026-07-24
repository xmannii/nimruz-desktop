import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import type { AgentRun } from "@/lib/workspace";
import { AppDatabase } from "../storage/database";
import { RunApprovalBroker } from "./approval-broker";

async function withBroker(
  operation: (database: AppDatabase, broker: RunApprovalBroker) => Promise<void>
) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "nimruz-approval-"));
  const database = new AppDatabase(path.join(directory, "test.sqlite3"));
  const broker = new RunApprovalBroker(database);
  const now = Date.now();
  const run: AgentRun = {
    id: "run-approval",
    workspaceId: "workspace-approval",
    chatId: "chat-approval",
    status: "running",
    model: "codex",
    providerId: "codex",
    error: null,
    stepCount: 0,
    startedAt: now,
    updatedAt: now,
    finishedAt: null,
  };
  database.saveWorkspace({
    id: "workspace-approval",
    title: "Approval",
    description: "",
    instructions: "",
    trust: {
      level: "ask",
      autoApproveReads: true,
      autoApproveWrites: false,
      autoApproveShell: false,
      autoApproveNetwork: false,
    },
    createdAt: now,
    updatedAt: now,
  });
  database.saveChats([{
    id: "chat-approval",
    title: "Approval",
    messages: [],
    model: "codex",
    providerId: "codex",
    workspaceId: "workspace-approval",
    createdAt: now,
    updatedAt: now,
  }]);
  database.saveAgentRun(run);
  try {
    await operation(database, broker);
  } finally {
    broker.dispose();
    database.close();
    await rm(directory, { recursive: true, force: true });
  }
}

test("persists and resolves a native provider approval", async () => {
  await withBroker(async (database, broker) => {
    const decisionPromise = broker.request({
      runId: "run-approval",
      workspaceId: "workspace-approval",
      toolName: "codex_command",
      risk: "shell",
      reason: "Run tests",
      input: { command: "pnpm test" },
      externalCallId: "codex-item-1",
    });

    const [approval] = database.listApprovals("run-approval");
    const [toolCall] = database.listToolCalls("run-approval");
    assert.equal(approval?.decision, "pending");
    assert.equal(toolCall?.status, "awaiting_approval");
    assert.equal(database.getAgentRun("run-approval")?.status, "awaiting_approval");

    assert.equal(
      broker.resolve(approval.id, { approved: true, forSession: true }),
      true
    );
    assert.deepEqual(await decisionPromise, {
      approved: true,
      forSession: true,
    });
    assert.equal(
      database.listApprovals("run-approval")[0]?.decision,
      "approved"
    );
    assert.equal(database.listToolCalls("run-approval")[0]?.status, "running");
    assert.equal(
      broker.completeExternalCall("run-approval", "codex-item-1", {
        itemType: "commandExecution",
      }),
      true
    );
    assert.equal(database.listToolCalls("run-approval")[0]?.status, "completed");
    assert.match(
      database.listToolCalls("run-approval")[0]?.outputJson ?? "",
      /commandExecution/
    );
    assert.equal(database.getAgentRun("run-approval")?.status, "running");
    assert.equal(
      broker.resolve(approval.id, { approved: false, forSession: false }),
      false
    );
  });
});

test("aborting a run denies its pending provider approvals", async () => {
  await withBroker(async (database, broker) => {
    const controller = new AbortController();
    const decisionPromise = broker.request({
      runId: "run-approval",
      workspaceId: "workspace-approval",
      toolName: "codex_file_change",
      risk: "write",
      reason: "Edit a file",
      input: { path: "src/index.ts" },
      signal: controller.signal,
    });
    controller.abort();

    assert.deepEqual(await decisionPromise, {
      approved: false,
      forSession: false,
    });
    assert.equal(
      database.listApprovals("run-approval")[0]?.decision,
      "denied"
    );
    assert.equal(database.listToolCalls("run-approval")[0]?.status, "denied");
  });
});
