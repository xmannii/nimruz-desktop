import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import type { LegacyDataSnapshot } from "@/lib/desktop-api";
import type { LocalChat, LocalWorkspace } from "@/lib/chat/storage";
import {
  DEFAULT_WORKSPACE_TRUST,
  HOME_WORKSPACE_ID,
  HOME_WORKSPACE_TITLE,
  type McpServerConfig,
} from "@/lib/workspace";
import { DEFAULT_PERSONALIZATION_SETTINGS } from "@/lib/settings/personalization";
import { DEFAULT_NOTIFICATION_SETTINGS } from "@/lib/settings/notifications";
import {
  CODEX_BASE_URL,
  CODEX_PROVIDER_ID,
  groupEnabledModels,
} from "@/lib/models/catalog";
import {
  validateChatsPayload,
  validateWorkspacePayload,
} from "./validation";
import { AppDatabase } from "./database";

async function withDatabase(
  operation: (database: AppDatabase) => void | Promise<void>
) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "nimruz-db-"));
  const database = new AppDatabase(path.join(directory, "test.sqlite3"));
  try {
    await operation(database);
  } finally {
    database.close();
    await rm(directory, { recursive: true, force: true });
  }
}

const project: LocalWorkspace = {
  id: "project-1",
  title: "Project",
  description: "Description",
  instructions: "",
  trust: DEFAULT_WORKSPACE_TRUST,
  createdAt: 1,
  updatedAt: 2,
};

const chat: LocalChat = {
  id: "chat-1",
  title: "Hello",
  providerId: "openrouter",
  model: "deepseek/deepseek-v4-flash",
  messages: [
    {
      id: "message-1",
      role: "user",
      parts: [{ type: "text", text: "Hello" }],
    },
  ],
  workspaceId: project.id,
  mcpServerIds: ["server-one", "server-two"],
  createdAt: 3,
  updatedAt: 4,
  titleIsCustom: true,
};

test("persists chats, projects, settings, memories, and credentials", async () => {
  await withDatabase((database) => {
    database.saveWorkspace(project);
    database.saveChats([chat]);
    database.savePersonalization({
      ...DEFAULT_PERSONALIZATION_SETTINGS,
      nickname: "مانی",
    });
    database.saveNotificationSettings({
      ...DEFAULT_NOTIFICATION_SETTINGS,
      agentCompleted: false,
      completionSound: true,
    });
    database.saveMemories([
      {
        id: "memory-1",
        content: "Likes local-first apps",
        category: "preference",
        createdAt: 5,
        updatedAt: 6,
      },
    ]);
    database.saveSubagents([
      {
        id: "research-model",
        providerId: "openrouter",
        modelId: "anthropic/claude",
        description: "Deep research",
        enabled: true,
      },
    ]);
    database.saveCompanionShortcut({
      enabled: true,
      accelerator: "Command+Shift+K",
      microphoneEnabled: true,
      microphoneAccelerator: "Command+Shift+M",
    });
    database.setCredential("openrouter", Buffer.from("encrypted"), "••••1234");

    assert.ok(
      database.loadWorkspaces().some((workspace) => workspace.id === project.id)
    );
    assert.ok(
      database
        .loadWorkspaces()
        .some((workspace) => workspace.id === HOME_WORKSPACE_ID)
    );
    assert.equal(database.loadChats()[0]?.messages[0]?.role, "user");
    assert.deepEqual(database.loadChats()[0]?.mcpServerIds, [
      "server-one",
      "server-two",
    ]);
    assert.equal(database.loadPersonalization().nickname, "مانی");
    assert.equal(database.loadNotificationSettings().agentCompleted, false);
    assert.equal(database.loadNotificationSettings().completionSound, true);
    assert.equal(database.loadMemories()[0]?.id, "memory-1");
    assert.equal(database.loadSubagents()[0]?.id, "research-model");
    assert.deepEqual(database.loadCompanionShortcut(), {
      enabled: true,
      accelerator: "Command+Shift+K",
      microphoneEnabled: true,
      microphoneAccelerator: "Command+Shift+M",
    });
    assert.equal(database.getCredential("openrouter")?.hint, "••••1234");

    database.deleteWorkspace(project.id);
    assert.equal(database.loadChats()[0]?.workspaceId, null);
    assert.throws(() => database.deleteWorkspace(HOME_WORKSPACE_ID));
    assert.equal(
      database.getWorkspace(HOME_WORKSPACE_ID)?.title,
      HOME_WORKSPACE_TITLE
    );
  });
});

test("persists onboarding completion and the active workspace", async () => {
  await withDatabase((database) => {
    assert.equal(database.loadOnboardingCompleted(), false);
    assert.equal(database.loadActiveWorkspaceId(), null);

    database.saveWorkspace(project);
    database.saveOnboardingCompleted(true);
    database.saveActiveWorkspaceId(project.id);

    assert.equal(database.loadOnboardingCompleted(), true);
    assert.equal(database.loadActiveWorkspaceId(), project.id);

    database.deleteWorkspace(project.id);
    assert.equal(database.loadActiveWorkspaceId(), null);
  });
});

test("persists workspace MCP servers and cascades them on workspace deletion", async () => {
  await withDatabase((database) => {
    database.saveWorkspace(project);
    const server: McpServerConfig = {
      id: "mcp-local",
      workspaceId: project.id,
      name: "Local tools",
      transport: "stdio",
      command: "node",
      args: ["server.mjs"],
      enabled: true,
      createdAt: 10,
      updatedAt: 11,
    };

    assert.deepEqual(database.saveMcpServer(server), server);
    assert.deepEqual(database.listMcpServers(project.id), [server]);

    const disabled = database.saveMcpServer({
      ...server,
      enabled: false,
      updatedAt: 12,
    });
    assert.equal(disabled.enabled, false);
    assert.equal(database.listMcpServers(project.id)[0]?.updatedAt, 12);

    database.deleteWorkspace(project.id);
    assert.deepEqual(database.listMcpServers(project.id), []);
  });
});

test("persists the last-seen what's-new version", async () => {
  await withDatabase((database) => {
    assert.equal(database.loadLastSeenVersion(), null);

    database.saveLastSeenVersion("1.0.1");
    assert.equal(database.loadLastSeenVersion(), "1.0.1");

    database.saveLastSeenVersion(" 1.0.2 ");
    assert.equal(database.loadLastSeenVersion(), "1.0.2");

    database.saveLastSeenVersion("   ");
    assert.equal(database.loadLastSeenVersion(), "1.0.2");
  });
});

test("imports legacy data only once", async () => {
  await withDatabase((database) => {
    const snapshot: LegacyDataSnapshot = {
      chats: [chat],
      projects: [project],
      personalization: DEFAULT_PERSONALIZATION_SETTINGS,
      memories: [],
    };
    assert.equal(database.importLegacyData(snapshot).imported, true);
    assert.equal(database.importLegacyData(snapshot).imported, false);
    assert.equal(database.loadChats().length, 1);
  });
});

test("rolls back a failed legacy import transaction", async () => {
  await withDatabase((database) => {
    const invalidChat = { ...chat, workspaceId: "missing-workspace" };
    assert.throws(() =>
      database.importLegacyData({
        chats: [invalidChat],
        projects: [project],
        personalization: DEFAULT_PERSONALIZATION_SETTINGS,
        memories: [],
      })
    );
    // Home is bootstrapped on open; a failed import must not leave project rows.
    assert.deepEqual(
      database.loadWorkspaces().map((workspace) => workspace.id),
      [HOME_WORKSPACE_ID]
    );
    assert.equal(database.loadChats().length, 0);
  });
});

test("rejects malformed IPC storage payloads", () => {
  assert.throws(() => validateChatsPayload([{ id: "../escape" }]));
  assert.throws(() => validateWorkspacePayload({ id: "invalid/id" }));
  assert.equal(validateChatsPayload([chat]).length, 1);
  assert.equal(validateWorkspacePayload(project).id, project.id);
});

test("seeds OpenRouter and Codex providers and supports custom providers", async () => {
  await withDatabase((database) => {
    const catalog = database.loadCatalog();
    assert.ok(catalog.providers.some((provider) => provider.id === "openrouter"));
    assert.deepEqual(database.getProvider(CODEX_PROVIDER_ID), {
      id: CODEX_PROVIDER_ID,
      name: "OpenAI Codex",
      kind: "codex",
      baseUrl: CODEX_BASE_URL,
      enabled: true,
      includeUsage: true,
      isBuiltin: true,
      authRequired: true,
      createdAt: database.getProvider(CODEX_PROVIDER_ID)?.createdAt,
      updatedAt: database.getProvider(CODEX_PROVIDER_ID)?.updatedAt,
    });
    assert.equal(database.listModels(CODEX_PROVIDER_ID).length, 0);
    assert.ok(catalog.models.length >= 7);
    assert.equal(database.loadChats()[0]?.providerId ?? "openrouter", "openrouter");

    const provider = database.saveProvider({
      id: "lmstudio",
      name: "LM Studio",
      kind: "openai-compatible",
      baseUrl: "http://localhost:1234/v1",
      enabled: true,
      includeUsage: true,
      authRequired: false,
    });
    assert.equal(provider.baseUrl, "http://localhost:1234/v1");

    const model = database.saveModel({
      id: "lmstudio-llama",
      providerId: "lmstudio",
      modelId: "llama-3.2-3b",
      name: "Llama",
      fullName: "Llama 3.2 3B",
      enabled: true,
      isDefault: true,
      source: "manual",
      supportsTools: true,
    });
    assert.equal(model.isDefault, true);
    assert.equal(database.listModels("lmstudio").length, 1);

    const resolved = database.resolveChatModel("lmstudio", "llama-3.2-3b");
    assert.equal(resolved?.provider.id, "lmstudio");
    assert.equal(resolved?.model.modelId, "llama-3.2-3b");

    database.deleteModel(model.id);
    assert.equal(database.listModels("lmstudio").length, 0);

    database.deleteProvider("lmstudio");
    assert.equal(database.getProvider("lmstudio"), null);

    assert.throws(() => database.deleteProvider("openrouter"));
    assert.throws(() => database.deleteProvider(CODEX_PROVIDER_ID));
  });
});

test("synchronizes the Codex model catalog atomically and preserves local preferences", async () => {
  await withDatabase((database) => {
    const initial = database.syncCodexModels([
      {
        id: "server-a",
        model: "gpt-5-codex",
        displayName: "GPT-5 Codex",
        description: "Main model",
        isDefault: true,
        inputModalities: ["text", "image"],
        supportedReasoningEfforts: ["low", "high"],
      },
      {
        id: "server-b",
        model: "codex-mini-latest",
        displayName: "Codex Mini",
        description: "Fast model",
        isDefault: false,
        inputModalities: ["text"],
        supportedReasoningEfforts: ["medium"],
      },
      {
        id: "duplicate-b",
        model: " codex-mini-latest ",
        displayName: "Codex Mini Updated",
        description: "Duplicate descriptor wins",
        isDefault: false,
        inputModalities: ["text"],
        supportedReasoningEfforts: ["medium"],
      },
      {
        id: "invalid",
        model: "",
        displayName: "Invalid",
        description: "",
        isDefault: false,
        inputModalities: [],
        supportedReasoningEfforts: [],
      },
    ]);

    assert.equal(initial.length, 2);
    const full = database.getModelByRef(CODEX_PROVIDER_ID, "gpt-5-codex");
    assert.equal(full?.source, "builtin");
    assert.equal(full?.supportsImages, false);
    assert.equal(full?.supportsTools, false);
    assert.equal(full?.supportsReasoningEffort, true);
    assert.equal(full?.inputPricePerM, 0);
    assert.equal(full?.outputPricePerM, 0);
    assert.equal(
      database.getModelByRef(CODEX_PROVIDER_ID, "codex-mini-latest")?.name,
      "Codex Mini Updated"
    );

    const disabled = database.saveModel({ ...full!, enabled: false });
    const refreshed = database.syncCodexModels([
      {
        id: "server-a-new",
        model: "gpt-5-codex",
        displayName: "GPT-5.1 Codex",
        description: "Refreshed metadata",
        isDefault: true,
        inputModalities: ["text"],
        supportedReasoningEfforts: [],
      },
    ]);

    assert.equal(refreshed.length, 1);
    assert.equal(refreshed[0]?.id, disabled.id);
    assert.equal(refreshed[0]?.enabled, false);
    assert.equal(refreshed[0]?.name, "GPT-5.1 Codex");
    assert.equal(refreshed[0]?.supportsImages, false);
    assert.equal(refreshed[0]?.supportsReasoningEffort, false);
    assert.equal(
      database.getModelByRef(CODEX_PROVIDER_ID, "codex-mini-latest"),
      null
    );

    assert.throws(() => database.syncCodexModels([]), /did not return any/);
    assert.equal(database.listModels(CODEX_PROVIDER_ID).length, 1);
  });
});

test("persists Codex thread continuity and deletes it with its chat", async () => {
  await withDatabase((database) => {
    const first = database.saveCodexChatThread({
      chatId: "chat-1",
      threadId: "thread-1",
      lastUserMessageId: "user-1",
    });
    assert.equal(first.chatId, "chat-1");
    assert.equal(first.threadId, "thread-1");
    assert.equal(first.lastUserMessageId, "user-1");
    assert.deepEqual(database.getCodexChatThread("chat-1"), first);

    const updated = database.saveCodexChatThread({
      chatId: "chat-1",
      threadId: "thread-2",
      lastUserMessageId: "user-2",
    });
    assert.equal(updated.threadId, "thread-2");
    assert.equal(updated.lastUserMessageId, "user-2");
    assert.equal(updated.createdAt, first.createdAt);
    assert.ok(updated.updatedAt >= first.updatedAt);

    const sanitized = database.saveCodexChatThread({
      chatId: "chat-1",
      threadId: "thread-2",
      lastUserMessageId: "bad\nmessage-id",
    });
    assert.equal(sanitized.lastUserMessageId, null);
    assert.throws(
      () =>
        database.saveCodexChatThread({
          chatId: "bad/chat",
          threadId: "thread-3",
          lastUserMessageId: null,
        }),
      /Invalid chat id/
    );
    assert.throws(
      () =>
        database.saveCodexChatThread({
          chatId: "chat-2",
          threadId: "bad\nthread",
          lastUserMessageId: null,
        }),
      /Invalid Codex thread id/
    );

    database.saveChats([{ ...chat, workspaceId: null }]);
    database.deleteChat(chat.id);
    assert.equal(database.getCodexChatThread(chat.id), null);
  });
});

test("clears all Codex thread mappings on account logout support path", async () => {
  await withDatabase((database) => {
    database.saveCodexChatThread({
      chatId: "chat-a",
      threadId: "thread-a",
      lastUserMessageId: "user-a",
    });
    database.saveCodexChatThread({
      chatId: "chat-b",
      threadId: "thread-b",
      lastUserMessageId: "user-b",
    });
    database.clearCodexChatThreads();
    assert.equal(database.getCodexChatThread("chat-a"), null);
    assert.equal(database.getCodexChatThread("chat-b"), null);
  });
});

test("deleting all chats also clears Codex thread mappings", async () => {
  await withDatabase((database) => {
    database.saveChats([{ ...chat, workspaceId: null }]);
    database.saveCodexChatThread({
      chatId: chat.id,
      threadId: "thread-delete-all",
      lastUserMessageId: "user-delete-all",
    });

    database.deleteAllChats();

    assert.equal(database.loadChats().length, 0);
    assert.equal(database.getCodexChatThread(chat.id), null);
  });
});

test("migrates a version-2 database to the combined version-10 schema", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "nimruz-db-v2-"));
  const databasePath = path.join(directory, "test.sqlite3");
  let database = new AppDatabase(databasePath);
  try {
    database.database.exec(`
      DELETE FROM provider_models WHERE provider_id = 'codex';
      DELETE FROM providers WHERE id = 'codex';
      DROP TABLE codex_chat_threads;
      PRAGMA user_version = 2;
    `);
    database.close();

    database = new AppDatabase(databasePath);
    assert.equal(database.getProvider(CODEX_PROVIDER_ID)?.kind, "codex");
    const mapping = database.saveCodexChatThread({
      chatId: "migrated-chat",
      threadId: "migrated-thread",
      lastUserMessageId: "migrated-user",
    });
    assert.equal(mapping.threadId, "migrated-thread");
    const version = database.database.prepare("PRAGMA user_version").get();
    assert.equal(version?.user_version, 10);
  } finally {
    database.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("migrates an official version-3 database to the combined version-10 schema", async () => {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "nimruz-db-official-v3-")
  );
  const databasePath = path.join(directory, "test.sqlite3");
  let database = new AppDatabase(databasePath);
  try {
    database.database.exec(`
      DELETE FROM provider_models WHERE provider_id = 'codex';
      DELETE FROM providers WHERE id = 'codex';
      DROP TABLE codex_chat_threads;
      PRAGMA user_version = 3;
    `);
    database.close();

    database = new AppDatabase(databasePath);
    assert.equal(database.getProvider(CODEX_PROVIDER_ID)?.kind, "codex");
    assert.equal(
      database.saveCodexChatThread({
        chatId: "official-v3-chat",
        threadId: "official-v3-thread",
        lastUserMessageId: "official-v3-user",
      }).threadId,
      "official-v3-thread"
    );
    const version = database.database.prepare("PRAGMA user_version").get();
    assert.equal(version?.user_version, 10);
  } finally {
    database.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("migrates a Codex version-3 database to the combined version-10 schema", async () => {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "nimruz-db-codex-v3-")
  );
  const databasePath = path.join(directory, "test.sqlite3");
  let database = new AppDatabase(databasePath);
  try {
    database.database.exec(`
      ALTER TABLE chats DROP COLUMN pinned_at;
      ALTER TABLE chats DROP COLUMN pinned;
      PRAGMA user_version = 3;
    `);
    database.close();

    database = new AppDatabase(databasePath);
    database.saveChats([
      {
        ...chat,
        workspaceId: null,
        pinned: true,
        pinnedAt: 10,
      },
    ]);
    assert.equal(database.loadChats()[0]?.pinned, true);
    assert.equal(database.loadChats()[0]?.pinnedAt, 10);
    const version = database.database.prepare("PRAGMA user_version").get();
    assert.equal(version?.user_version, 10);
  } finally {
    database.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("disabling OpenRouter removes its models from picker groups", async () => {
  await withDatabase((database) => {
    database.saveProvider({
      id: "openrouter",
      name: "OpenRouter",
      kind: "openrouter",
      baseUrl: "https://openrouter.ai/api/v1",
      enabled: false,
    });

    const catalog = database.loadCatalog();
    const groups = groupEnabledModels(catalog.models, catalog.providers);
    assert.equal(groups.length, 0);
    assert.equal(database.getProvider("openrouter")?.enabled, false);
  });
});

test("normalizes private http base URLs and rejects public http", async () => {
  await withDatabase((database) => {
    assert.throws(() =>
      database.saveProvider({
        id: "bad",
        name: "Bad",
        kind: "openai-compatible",
        baseUrl: "http://example.com/v1",
      })
    );
  });
});
