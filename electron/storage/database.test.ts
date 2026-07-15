import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import type { LegacyDataSnapshot } from "@/lib/desktop-api";
import type { LocalChat, LocalProject } from "@/lib/chat/storage";
import { DEFAULT_PERSONALIZATION_SETTINGS } from "@/lib/settings/personalization";
import { groupEnabledModels } from "@/lib/models/catalog";
import {
  validateChatsPayload,
  validateProjectPayload,
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

const project: LocalProject = {
  id: "project-1",
  title: "Project",
  description: "Description",
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
  projectId: project.id,
  createdAt: 3,
  updatedAt: 4,
  titleIsCustom: true,
};

test("persists chats, projects, settings, memories, and credentials", async () => {
  await withDatabase((database) => {
    database.saveProject(project);
    database.saveChats([chat]);
    database.savePersonalization({
      ...DEFAULT_PERSONALIZATION_SETTINGS,
      nickname: "مانی",
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
    database.setCredential("openrouter", Buffer.from("encrypted"), "••••1234");

    assert.equal(database.loadProjects()[0]?.title, "Project");
    assert.equal(database.loadChats()[0]?.messages[0]?.role, "user");
    assert.equal(database.loadPersonalization().nickname, "مانی");
    assert.equal(database.loadMemories()[0]?.id, "memory-1");
    assert.equal(database.getCredential("openrouter")?.hint, "••••1234");

    database.deleteProject(project.id);
    assert.equal(database.loadChats()[0]?.projectId, null);
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
    const invalidChat = { ...chat, projectId: "missing-project" };
    assert.throws(() =>
      database.importLegacyData({
        chats: [invalidChat],
        projects: [project],
        personalization: DEFAULT_PERSONALIZATION_SETTINGS,
        memories: [],
      })
    );
    assert.equal(database.loadProjects().length, 0);
    assert.equal(database.loadChats().length, 0);
  });
});

test("rejects malformed IPC storage payloads", () => {
  assert.throws(() => validateChatsPayload([{ id: "../escape" }]));
  assert.throws(() => validateProjectPayload({ id: "invalid/id" }));
  assert.equal(validateChatsPayload([chat]).length, 1);
  assert.equal(validateProjectPayload(project).id, project.id);
});

test("seeds OpenRouter catalog and supports custom providers", async () => {
  await withDatabase((database) => {
    const catalog = database.loadCatalog();
    assert.ok(catalog.providers.some((provider) => provider.id === "openrouter"));
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
  });
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
