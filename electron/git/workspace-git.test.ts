import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  DEFAULT_WORKSPACE_TRUST,
  type LocalWorkspace,
  type WorkspaceRoot,
} from "@/lib/workspace";
import { AppDatabase } from "../storage/database";
import { TurnCheckpointManager } from "./checkpoint-manager";
import { runGit } from "./git-process";
import { ChatWorktreeManager } from "./worktree-manager";

const gitIdentity = {
  GIT_AUTHOR_NAME: "Nimruz Tests",
  GIT_AUTHOR_EMAIL: "tests@nimruz.local",
  GIT_COMMITTER_NAME: "Nimruz Tests",
  GIT_COMMITTER_EMAIL: "tests@nimruz.local",
};

async function createFixture() {
  const directory = await mkdtemp(path.join(os.tmpdir(), "nimruz-git-test-"));
  const repository = path.join(directory, "repository");
  const userData = path.join(directory, "user-data");
  await mkdir(path.join(repository, "app"), { recursive: true });
  await writeFile(path.join(repository, "README.md"), "root\n");
  await writeFile(path.join(repository, "app", "feature.txt"), "before\n");
  await runGit(["init", "-b", "main"], { cwd: repository });
  await runGit(["add", "."], { cwd: repository });
  await runGit(["commit", "-m", "initial"], {
    cwd: repository,
    env: gitIdentity,
  });

  const database = new AppDatabase(path.join(directory, "nimruz.sqlite3"));
  const workspace: LocalWorkspace = {
    id: "workspace-1",
    title: "Fixture",
    description: "",
    instructions: "",
    trust: DEFAULT_WORKSPACE_TRUST,
    createdAt: 1,
    updatedAt: 1,
  };
  const root: WorkspaceRoot = {
    id: "root-1",
    workspaceId: workspace.id,
    kind: "linked",
    path: path.join(repository, "app"),
    label: "app",
    isPrimary: true,
    createdAt: 1,
  };
  database.saveWorkspace(workspace);
  database.saveWorkspaceRoot(root);

  return {
    directory,
    repository,
    userData,
    database,
    workspace,
    close: async () => {
      database.close();
      await rm(directory, { recursive: true, force: true });
    },
  };
}

function saveRun(
  database: AppDatabase,
  workspaceId: string,
  runId: string,
  chatId: string
) {
  database.saveAgentRun({
    id: runId,
    workspaceId,
    chatId,
    status: "running",
    model: "test-model",
    providerId: "test-provider",
    error: null,
    stepCount: 0,
    startedAt: Date.now(),
    updatedAt: Date.now(),
    finishedAt: null,
  });
}

test("creates and reuses an isolated worktree for a nested project root", async () => {
  const fixture = await createFixture();
  try {
    const manager = new ChatWorktreeManager(
      fixture.database,
      fixture.userData
    );
    const worktree = await manager.ensureWorktree(
      fixture.workspace.id,
      "chat-one"
    );

    assert.equal(worktree.branchName, "nimruz/chat-one");
    assert.equal(path.basename(worktree.workingPath), "app");
    assert.match(
      await readFile(path.join(worktree.workingPath, "feature.txt"), "utf8"),
      /^before\r?\n$/
    );
    await writeFile(
      path.join(worktree.workingPath, "feature.txt"),
      "worktree only\n"
    );
    assert.equal(
      await readFile(path.join(fixture.repository, "app", "feature.txt"), "utf8"),
      "before\n"
    );

    const reused = await manager.ensureWorktree(
      fixture.workspace.id,
      "chat-one"
    );
    assert.deepEqual(reused, worktree);
  } finally {
    await fixture.close();
  }
});

test("captures a bounded turn diff and restores the exact pre-turn state", async () => {
  const fixture = await createFixture();
  try {
    const worktree = await new ChatWorktreeManager(
      fixture.database,
      fixture.userData
    ).ensureWorktree(fixture.workspace.id, "chat-checkpoint");
    const checkpoints = new TurnCheckpointManager(fixture.database);
    saveRun(
      fixture.database,
      fixture.workspace.id,
      "run-one",
      "chat-checkpoint"
    );
    const checkpoint = await checkpoints.begin({
      runId: "run-one",
      chatId: "chat-checkpoint",
      workspaceId: fixture.workspace.id,
      workingPath: worktree.workingPath,
    });

    await writeFile(
      path.join(worktree.workingPath, "feature.txt"),
      "after\nsecond line\n"
    );
    await writeFile(path.join(worktree.workingPath, "added.txt"), "new\n");

    const completed = await checkpoints.complete("run-one");
    assert.equal(completed?.status, "completed");
    assert.equal(completed?.filesChanged, 2);
    assert.equal(completed?.additions, 3);
    assert.equal(completed?.deletions, 1);
    assert.ok(completed?.afterCommit);
    assert.equal(checkpoint.beforeCommit === completed?.afterCommit, false);

    const diff = await checkpoints.getDiff("run-one");
    assert.equal(diff?.files.length, 2);
    assert.deepEqual(
      diff?.files.map((file) => [file.path, file.status]),
      [
        ["app/added.txt", "added"],
        ["app/feature.txt", "modified"],
      ]
    );
    assert.match(
      diff?.files.find((file) => file.path.endsWith("feature.txt"))?.patch ?? "",
      /second line/
    );

    await checkpoints.restoreBefore("run-one");
    assert.match(
      await readFile(path.join(worktree.workingPath, "feature.txt"), "utf8"),
      /^before\r?\n$/
    );
    await assert.rejects(
      readFile(path.join(worktree.workingPath, "added.txt"), "utf8"),
      /ENOENT/
    );
  } finally {
    await fixture.close();
  }
});

test("blocks restore after newer workspace changes", async () => {
  const fixture = await createFixture();
  try {
    const worktree = await new ChatWorktreeManager(
      fixture.database,
      fixture.userData
    ).ensureWorktree(fixture.workspace.id, "chat-stale");
    const checkpoints = new TurnCheckpointManager(fixture.database);
    saveRun(
      fixture.database,
      fixture.workspace.id,
      "run-stale",
      "chat-stale"
    );
    await checkpoints.begin({
      runId: "run-stale",
      chatId: "chat-stale",
      workspaceId: fixture.workspace.id,
      workingPath: worktree.workingPath,
    });
    await writeFile(path.join(worktree.workingPath, "feature.txt"), "agent\n");
    await checkpoints.complete("run-stale");
    await writeFile(path.join(worktree.workingPath, "feature.txt"), "newer\n");

    await assert.rejects(
      checkpoints.restoreBefore("run-stale"),
      /changed after this turn/
    );
    assert.equal(
      await readFile(path.join(worktree.workingPath, "feature.txt"), "utf8"),
      "newer\n"
    );
  } finally {
    await fixture.close();
  }
});
