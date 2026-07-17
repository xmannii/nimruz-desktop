import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { HOME_WORKSPACE_ID, HOME_WORKSPACE_TITLE } from "@/lib/workspace";
import { AppDatabase } from "./database";

/**
 * Build a legacy v3 database (projects + chats.project_id) so we can assert the
 * v4 migration renames projects -> workspaces, renames chats.project_id ->
 * workspace_id, and preserves the linkage.
 */
function seedV3Database(file: string) {
  const db = new DatabaseSync(file);
  db.exec(`
    CREATE TABLE projects (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE chats (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      model TEXT NOT NULL,
      messages_json TEXT NOT NULL,
      project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      title_is_custom INTEGER NOT NULL DEFAULT 0,
      provider_id TEXT NOT NULL DEFAULT 'openrouter',
      pinned INTEGER NOT NULL DEFAULT 0,
      pinned_at INTEGER
    );
    CREATE INDEX chats_project_id_idx ON chats(project_id);
    CREATE INDEX projects_updated_at_idx ON projects(updated_at DESC);
    CREATE TABLE settings (key TEXT PRIMARY KEY, value_json TEXT NOT NULL, updated_at INTEGER NOT NULL);
    CREATE TABLE metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE memories (id TEXT PRIMARY KEY, content TEXT NOT NULL, category TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
    CREATE TABLE credentials (provider TEXT PRIMARY KEY, encrypted_key BLOB NOT NULL, hint TEXT, updated_at INTEGER NOT NULL);
    CREATE TABLE providers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      kind TEXT NOT NULL,
      base_url TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      include_usage INTEGER NOT NULL DEFAULT 1,
      is_builtin INTEGER NOT NULL DEFAULT 0,
      auth_required INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE provider_models (
      id TEXT PRIMARY KEY,
      provider_id TEXT NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
      model_id TEXT NOT NULL,
      name TEXT NOT NULL,
      full_name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      context_length INTEGER NOT NULL DEFAULT 0,
      max_output INTEGER NOT NULL DEFAULT 0,
      input_price_per_m REAL NOT NULL DEFAULT 0,
      output_price_per_m REAL NOT NULL DEFAULT 0,
      supports_images INTEGER NOT NULL DEFAULT 0,
      supports_tools INTEGER NOT NULL DEFAULT 1,
      supports_reasoning_effort INTEGER NOT NULL DEFAULT 0,
      enabled INTEGER NOT NULL DEFAULT 1,
      is_default INTEGER NOT NULL DEFAULT 0,
      source TEXT NOT NULL DEFAULT 'manual',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      UNIQUE(provider_id, model_id)
    );
    PRAGMA user_version = 3;
  `);
  db.prepare(
    "INSERT INTO projects (id, title, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?)"
  ).run("proj-1", "Legacy Project", "old", 100, 200);
  db.prepare(
    `INSERT INTO chats (id, title, model, messages_json, project_id, created_at, updated_at, title_is_custom, provider_id, pinned)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    "chat-1",
    "Legacy Chat",
    "deepseek/deepseek-v4-flash",
    JSON.stringify([
      { id: "m1", role: "user", parts: [{ type: "text", text: "hi" }] },
    ]),
    "proj-1",
    300,
    400,
    1,
    "openrouter",
    0
  );
  db.close();
}

function seedCodexV4Database(file: string) {
  seedV3Database(file);
  const db = new DatabaseSync(file);
  db.exec(`
    CREATE TABLE codex_chat_threads (
      chat_id TEXT PRIMARY KEY,
      thread_id TEXT NOT NULL,
      last_user_message_id TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE UNIQUE INDEX codex_chat_threads_thread_id_idx
      ON codex_chat_threads(thread_id);
    INSERT INTO codex_chat_threads (
      chat_id, thread_id, last_user_message_id, created_at, updated_at
    ) VALUES (
      'chat-1', 'legacy-codex-thread', 'm1', 500, 600
    );
    PRAGMA user_version = 4;
  `);
  db.close();
}

async function withMigratedDatabase(
  operation: (database: AppDatabase) => void | Promise<void>
) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "nimruz-migrate-"));
  const file = path.join(directory, "test.sqlite3");
  seedV3Database(file);
  const database = new AppDatabase(file);
  try {
    await operation(database);
  } finally {
    database.close();
    await rm(directory, { recursive: true, force: true });
  }
}

test("migrates a v3 database to the latest schema version", async () => {
  await withMigratedDatabase((database) => {
    const version = (
      database as unknown as {
        database: DatabaseSync;
      }
    ).database
      .prepare("PRAGMA user_version")
      .get() as { user_version: number };
    assert.equal(version.user_version, 6);
  });
});

test("renames legacy projects into workspaces with defaults", async () => {
  await withMigratedDatabase((database) => {
    const workspaces = database.loadWorkspaces();
    assert.equal(workspaces.length, 2);
    const home = workspaces.find((workspace) => workspace.id === HOME_WORKSPACE_ID);
    assert.ok(home);
    assert.equal(home.title, HOME_WORKSPACE_TITLE);
    const workspace = workspaces.find((item) => item.id === "proj-1");
    assert.ok(workspace);
    assert.equal(workspace.title, "Legacy Project");
    assert.equal(workspace.instructions, "");
    assert.ok(workspace.trust);
  });
});

test("bootstraps the Home workspace on migrate", async () => {
  await withMigratedDatabase((database) => {
    const home = database.ensureHomeWorkspace();
    assert.equal(home.id, HOME_WORKSPACE_ID);
    assert.equal(home.title, HOME_WORKSPACE_TITLE);
  });
});

test("preserves the chat->workspace link across migration", async () => {
  await withMigratedDatabase((database) => {
    const chats = database.loadChats();
    assert.equal(chats.length, 1);
    assert.equal(chats[0].id, "chat-1");
    assert.equal(chats[0].workspaceId, "proj-1");
  });
});

test("creates the new agent tables so writes succeed", async () => {
  await withMigratedDatabase((database) => {
    assert.deepEqual(database.loadWorkspaceRoots("proj-1"), []);
    assert.deepEqual(database.listTasks("proj-1"), []);
    assert.deepEqual(database.listArtifacts("proj-1"), []);
    assert.deepEqual(database.listAgentRuns({ workspaceId: "proj-1" }), []);
  });
});

test("supports the is_primary column added in v5", async () => {
  await withMigratedDatabase((database) => {
    database.saveWorkspaceRoot({
      id: "root-a",
      workspaceId: "proj-1",
      kind: "linked",
      path: "/tmp/proj-a",
      label: "A",
      isPrimary: false,
      createdAt: 1,
    });
    database.saveWorkspaceRoot({
      id: "root-b",
      workspaceId: "proj-1",
      kind: "linked",
      path: "/tmp/proj-b",
      label: "B",
      isPrimary: false,
      createdAt: 2,
    });

    const roots = database.setPrimaryWorkspaceRoot("proj-1", "root-b");
    assert.equal(roots.find((root) => root.id === "root-b")?.isPrimary, true);
    assert.equal(roots.find((root) => root.id === "root-a")?.isPrimary, false);
  });
});

test("migrates the old combined Codex v4 lineage into agentic schema v6", async () => {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "nimruz-migrate-codex-v4-")
  );
  const file = path.join(directory, "test.sqlite3");
  seedCodexV4Database(file);
  const database = new AppDatabase(file);
  try {
    assert.equal(database.getWorkspace("proj-1")?.title, "Legacy Project");
    assert.equal(database.loadChats()[0]?.workspaceId, "proj-1");
    assert.equal(
      database.getCodexChatThread("chat-1")?.threadId,
      "legacy-codex-thread"
    );
    const version = database.database
      .prepare("PRAGMA user_version")
      .get() as { user_version: number };
    assert.equal(version.user_version, 6);
  } finally {
    database.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("adds Codex thread storage to the official agentic v5 lineage", async () => {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "nimruz-migrate-agentic-v5-")
  );
  const file = path.join(directory, "test.sqlite3");
  seedV3Database(file);

  const initial = new AppDatabase(file);
  initial.saveWorkspaceRoot({
    id: "root-v5",
    workspaceId: "proj-1",
    kind: "linked",
    path: "/tmp/proj-v5",
    label: "V5 root",
    isPrimary: true,
    createdAt: 700,
  });
  initial.close();

  const legacy = new DatabaseSync(file);
  legacy.exec(`
    DROP INDEX IF EXISTS codex_chat_threads_thread_id_idx;
    DROP TABLE IF EXISTS codex_chat_threads;
    PRAGMA user_version = 5;
  `);
  legacy.close();

  const migrated = new AppDatabase(file);
  try {
    assert.equal(
      migrated.loadWorkspaceRoots("proj-1")[0]?.id,
      "root-v5"
    );
    migrated.saveCodexChatThread({
      chatId: "chat-1",
      threadId: "thread-after-v5",
      lastUserMessageId: "m1",
    });
    assert.equal(
      migrated.getCodexChatThread("chat-1")?.threadId,
      "thread-after-v5"
    );
    const version = migrated.database
      .prepare("PRAGMA user_version")
      .get() as { user_version: number };
    assert.equal(version.user_version, 6);
  } finally {
    migrated.close();
    await rm(directory, { recursive: true, force: true });
  }
});
