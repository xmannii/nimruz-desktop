import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import type { AgentRun } from "@/lib/workspace";
import { RunApprovalBroker } from "../agent/approval-broker";
import { AppDatabase } from "../storage/database";
import { RemoteAccessService } from "./service";

async function withService(
  operation: (
    database: AppDatabase,
    broker: RunApprovalBroker,
    service: RemoteAccessService
  ) => Promise<void>
) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "nimruz-remote-"));
  const database = new AppDatabase(path.join(directory, "test.sqlite3"));
  const broker = new RunApprovalBroker(database);
  const service = new RemoteAccessService(database, broker);
  const now = Date.now();
  database.saveWorkspace({
    id: "workspace-remote",
    title: "Remote",
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
  database.saveChats([
    {
      id: "chat-remote",
      title: "Remote",
      messages: [],
      model: "codex",
      providerId: "codex",
      workspaceId: "workspace-remote",
      createdAt: now,
      updatedAt: now,
    },
  ]);
  database.saveAgentRun({
    id: "run-remote",
    workspaceId: "workspace-remote",
    chatId: "chat-remote",
    status: "running",
    model: "codex",
    providerId: "codex",
    error: null,
    stepCount: 2,
    totalTokens: 321,
    startedAt: now,
    updatedAt: now,
    finishedAt: null,
  } satisfies AgentRun);

  try {
    await operation(database, broker, service);
  } finally {
    await service.stop();
    broker.dispose();
    database.close();
    await rm(directory, { recursive: true, force: true });
  }
}

test("serves scoped status and resolves a real pending approval", async () => {
  await withService(async (database, broker, service) => {
    const session = await service.start();
    assert.equal(session.enabled, true);
    assert.match(session.endpoint ?? "", /^http:\/\/127\.0\.0\.1:\d+$/);
    assert.equal(session.token.length >= 40, true);

    const unauthorized = await fetch(`${session.endpoint}/v1/status`);
    assert.equal(unauthorized.status, 401);
    const browserOrigin = await fetch(`${session.endpoint}/v1/status`, {
      headers: {
        Authorization: `Bearer ${session.token}`,
        Origin: "https://malicious.example",
      },
    });
    assert.equal(browserOrigin.status, 403);

    const decisionPromise = broker.request({
      runId: "run-remote",
      workspaceId: "workspace-remote",
      toolName: "codex_command",
      risk: "shell",
      reason: "Run the test suite",
      input: { command: "pnpm test" },
    });
    const statusResponse = await fetch(`${session.endpoint}/v1/status`, {
      headers: { Authorization: `Bearer ${session.token}` },
    });
    assert.equal(statusResponse.status, 200);
    const status = (await statusResponse.json()) as {
      runs: Array<{ id: string; totalTokens: number }>;
      pendingApprovals: Array<{
        id: string;
        input: { command: string };
      }>;
    };
    assert.deepEqual(status.runs[0], {
      id: "run-remote",
      workspaceId: "workspace-remote",
      chatId: "chat-remote",
      status: "awaiting_approval",
      model: "codex",
      providerId: "codex",
      stepCount: 2,
      totalTokens: 321,
      startedAt: database.getAgentRun("run-remote")?.startedAt,
      updatedAt: database.getAgentRun("run-remote")?.updatedAt,
      finishedAt: null,
    });
    assert.equal(status.pendingApprovals[0]?.input.command, "pnpm test");

    const approvalResponse = await fetch(
      `${session.endpoint}/v1/approvals/${status.pendingApprovals[0].id}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ approved: true }),
      }
    );
    assert.equal(approvalResponse.status, 200);
    assert.deepEqual(await decisionPromise, {
      approved: true,
      forSession: false,
    });
    assert.equal(database.listApprovals("run-remote")[0]?.decision, "approved");
  });
});

test("stopping revokes the process-local token", async () => {
  await withService(async (_database, _broker, service) => {
    const [first, concurrent] = await Promise.all([
      service.start(),
      service.start(),
    ]);
    assert.deepEqual(concurrent, first);
    await service.stop();
    assert.deepEqual(service.getStatus(), { enabled: false, endpoint: null });
    const second = await service.start();
    assert.notEqual(second.token, first.token);
    assert.notEqual(second.endpoint, null);
  });
});
