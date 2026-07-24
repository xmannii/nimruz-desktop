import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  DEFAULT_WORKSPACE_TRUST,
  type LocalWorkspace,
  type WorkspaceRoot,
} from "@/lib/workspace";
import { WorkspaceFilesStore } from "../agent/workspace-files";
import { AppDatabase } from "../storage/database";
import { WorkspaceTerminalManager } from "./manager";

async function fixture() {
  const directory = await mkdtemp(path.join(os.tmpdir(), "nimruz-terminal-"));
  const repository = path.join(directory, "repository");
  await mkdir(repository, { recursive: true });
  await writeFile(
    path.join(repository, "package.json"),
    JSON.stringify({
      scripts: {
        "test:live":
          'node -e "console.log(`PTY_TEST_OK:${process.env.NIMRUZ_WORKSPACE}`)"',
        dev: 'node -e "console.log(`NOT_EXPOSED`)"',
        "test&unsafe": 'node -e "console.log(`UNSAFE`)"',
      },
    })
  );
  const database = new AppDatabase(path.join(directory, "nimruz.sqlite3"));
  const workspace: LocalWorkspace = {
    id: "terminal-workspace",
    title: "Terminal",
    description: "",
    instructions: "",
    trust: DEFAULT_WORKSPACE_TRUST,
    createdAt: 1,
    updatedAt: 1,
  };
  const root: WorkspaceRoot = {
    id: "terminal-root",
    workspaceId: workspace.id,
    kind: "linked",
    path: repository,
    label: "Terminal",
    isPrimary: true,
    createdAt: 1,
  };
  database.saveWorkspace(workspace);
  database.saveWorkspaceRoot(root);
  const files = new WorkspaceFilesStore(
    database,
    path.join(directory, "user-data")
  );
  return {
    directory,
    repository,
    database,
    workspace,
    files,
    close: async () => {
      database.close();
      await rm(directory, { recursive: true, force: true }).catch((error) => {
        if (
          !error ||
          typeof error !== "object" ||
          !("code" in error) ||
          error.code !== "EBUSY"
        ) {
          throw error;
        }
      });
    },
  };
}

function waitForExit(
  manager: WorkspaceTerminalManager,
  workspaceId: string,
  sessionId: string
) {
  return new Promise<void>((resolve, reject) => {
    const deadline = Date.now() + 15_000;
    const poll = () => {
      const session = manager
        .list(workspaceId)
        .find((candidate) => candidate.id === sessionId);
      if (session?.status === "exited") {
        resolve();
        return;
      }
      if (Date.now() > deadline) {
        reject(new Error("Timed out waiting for terminal process."));
        return;
      }
      setTimeout(poll, 25);
    };
    poll();
  });
}

function waitForOutput(events: string[], pattern: RegExp) {
  return new Promise<void>((resolve, reject) => {
    const deadline = Date.now() + 10_000;
    const poll = () => {
      if (pattern.test(events.join(""))) {
        resolve();
        return;
      }
      if (Date.now() > deadline) {
        reject(new Error(`Timed out waiting for output: ${events.join("")}`));
        return;
      }
      setTimeout(poll, 25);
    };
    poll();
  });
}

test("discovers only safe test scripts and executes one in a real PTY", async () => {
  const context = await fixture();
  const events: string[] = [];
  const manager = new WorkspaceTerminalManager(context.files, (event) => {
    if (event.type === "data") events.push(event.data);
  });
  try {
    assert.deepEqual(manager.listTestScripts(context.workspace.id), [
      {
        name: "test:live",
        command:
          'node -e "console.log(`PTY_TEST_OK:${process.env.NIMRUZ_WORKSPACE}`)"',
      },
    ]);

    const session = manager.startTest({
      workspaceId: context.workspace.id,
      script: "test:live",
    });
    await waitForExit(manager, context.workspace.id, session.id);
    const finished = manager
      .list(context.workspace.id)
      .find((candidate) => candidate.id === session.id);
    const output = events.join("");
    assert.equal(finished?.exitCode, 0, output);
    assert.match(output, /PTY_TEST_OK:/);
    assert.match(output, new RegExp(context.repository.replaceAll("\\", "\\\\")));
  } finally {
    manager.dispose();
    await context.close();
  }
});

test("accepts input through an interactive workspace shell", async () => {
  const context = await fixture();
  const events: string[] = [];
  const manager = new WorkspaceTerminalManager(context.files, (event) => {
    if (event.type === "data") events.push(event.data);
  });
  try {
    const session = manager.startShell({
      workspaceId: context.workspace.id,
    });
    // ConPTY can drop input sent before the shell has attached its console.
    await waitForOutput(events, /./s);
    const command =
      process.platform === "win32"
        ? "Write-Output TERMINAL_INPUT_OK\r\nexit\r\n"
        : "printf 'TERMINAL_INPUT_OK\\n'\nexit\n";
    manager.write(session.id, command);
    await waitForOutput(events, /TERMINAL_INPUT_OK/);
    await waitForExit(manager, context.workspace.id, session.id);
    assert.match(events.join(""), /TERMINAL_INPUT_OK/);
  } finally {
    manager.dispose();
    await context.close();
  }
});
