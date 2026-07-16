import { ipcMain, type IpcMainInvokeEvent } from "electron";
import { nanoid } from "nanoid";
import type { LegacyImportResult } from "@/lib/desktop-api";
import type { MemoryEntry } from "@/lib/settings/memories";
import type { PersonalizationSettings } from "@/lib/settings/personalization";
import type {
  SkillDocument,
  SkillSummary,
  SkillsPreferences,
} from "@/lib/skills/index";
import { normalizeSkillName, sanitizeSkillsPreferences } from "@/lib/skills/index";
import {
  OPENROUTER_PROVIDER_ID,
  PROVIDER_LIMITS,
} from "@/lib/models/catalog";
import { CredentialService } from "./credentials";
import { AppDatabase } from "./storage/database";
import { SkillStore } from "./skills/store";
import { registerWindowControlHandlers } from "./window-controls";
import {
  validateChatsPayload,
  validateLegacySnapshot,
  validateProjectPayload,
} from "./storage/validation";
import {
  checkForAppUpdate,
  getAppVersion,
  openExternalUrl,
} from "./updates";

function assertTrustedSender(event: IpcMainInvokeEvent) {
  const url = event.senderFrame?.url ?? "";
  if (
    !url.startsWith("http://127.0.0.1:") &&
    !url.startsWith("http://localhost:")
  ) {
    throw new Error("Untrusted IPC sender.");
  }
}

export function registerIpcHandlers(options: {
  database: AppDatabase;
  credentials: CredentialService;
  skills: SkillStore;
  sessionToken: string;
  getMainWindow: () => import("electron").BrowserWindow | null;
}) {
  const { database, credentials, skills, sessionToken, getMainWindow } = options;

  function handle<TArgs extends unknown[], TResult>(
    channel: string,
    callback: (...args: TArgs) => TResult | Promise<TResult>
  ) {
    ipcMain.handle(channel, (event, ...args: unknown[]) => {
      assertTrustedSender(event);
      return callback(...(args as TArgs));
    });
  }

  handle("auth:get-session-token", () => sessionToken);

  handle("credentials:status", (providerId?: string) =>
    credentials.getStatus(providerId ?? OPENROUTER_PROVIDER_ID)
  );
  handle("credentials:set-key", (providerId: string, key: string) =>
    credentials.setKey(providerId, key)
  );
  handle("credentials:clear-key", (providerId: string) =>
    credentials.clearKey(providerId)
  );
  handle(
    "credentials:test-provider",
    (options: { providerId?: string; baseUrl?: string; apiKey?: string }) =>
      credentials.testProvider(options)
  );
  handle("credentials:set-openrouter", (key: string) =>
    credentials.setOpenRouterKey(key)
  );
  handle("credentials:clear-openrouter", () =>
    credentials.clearOpenRouterKey()
  );
  handle("credentials:test-openrouter", (key?: string) =>
    credentials.testOpenRouterKey(key)
  );

  handle("providers:list-catalog", () => database.loadCatalog());
  handle("providers:save-provider", (value: unknown) =>
    database.saveProvider(value)
  );
  handle("providers:delete-provider", (id: string) =>
    database.deleteProvider(id)
  );
  handle("providers:save-model", (value: unknown) => database.saveModel(value));
  handle("providers:delete-model", (id: string) => database.deleteModel(id));
  handle("providers:delete-provider-models", (providerId: string) =>
    database.deleteProviderModels(providerId)
  );
  handle("providers:set-default-model", (id: string) =>
    database.setDefaultModel(id)
  );
  handle(
    "providers:discover-models",
    async (options: {
      providerId: string;
      baseUrl?: string;
      apiKey?: string;
      import?: boolean;
    }) => {
      const provider = database.getProvider(options.providerId);
      if (!provider) {
        return {
          ok: false,
          message: "ارائه‌دهنده یافت نشد.",
          models: [],
          added: 0,
          updated: 0,
        };
      }

      if (provider.isBuiltin) {
        return {
          ok: false,
          message:
            "دریافت گروهی مدل برای OpenRouter پشتیبانی نمی‌شود. مدل‌های پیش‌فرض آماده‌اند؛ برای مدل دیگر شناسه را دستی اضافه کنید.",
          models: [],
          added: 0,
          updated: 0,
        };
      }

      const discovery = await credentials.discoverModels(options);
      if (!discovery.ok || !options.import) {
        return discovery;
      }

      let added = 0;
      let updated = 0;
      let skipped = 0;
      const existing = database.listModels(options.providerId);
      const remainingSlots = Math.max(
        0,
        PROVIDER_LIMITS.maxModelsPerProvider - existing.length
      );

      for (const item of discovery.models) {
        const current = existing.find((model) => model.modelId === item.modelId);
        if (current) {
          database.saveModel({
            ...current,
            name: current.name || item.name || current.modelId,
            fullName: current.fullName || item.name || current.modelId,
            source: current.source === "builtin" ? "builtin" : "discovered",
          });
          updated += 1;
          continue;
        }

        if (added >= remainingSlots) {
          skipped += 1;
          continue;
        }

        const shortName =
          item.name || item.modelId.split("/").at(-1) || item.modelId;
        database.saveModel({
          id: nanoid(),
          providerId: options.providerId,
          modelId: item.modelId,
          name: shortName,
          fullName: item.name || shortName,
          description: "",
          enabled: true,
          isDefault: false,
          source: "discovered",
          supportsImages: false,
          supportsTools: true,
          supportsReasoningEffort: false,
          contextLength: 0,
          maxOutput: 0,
          inputPricePerM: 0,
          outputPricePerM: 0,
        });
        added += 1;
      }

      const limitNote =
        skipped > 0
          ? ` ${skipped.toLocaleString("fa-IR")} مدل به‌خاطر سقف ۲۰۰ مدل وارد نشد.`
          : "";

      return {
        ...discovery,
        added,
        updated,
        message: `${added.toLocaleString("fa-IR")} مدل جدید و ${updated.toLocaleString("fa-IR")} مدل به‌روز شد.${limitNote}`,
        catalog: database.loadCatalog(),
      };
    }
  );

  handle("storage:load-chats", () => database.loadChats());
  handle("storage:save-chats", (value: unknown) =>
    database.saveChats(validateChatsPayload(value))
  );
  handle("storage:delete-chat", (id: string) => database.deleteChat(id));

  handle("storage:load-projects", () => database.loadProjects());
  handle("storage:save-project", (value: unknown) =>
    database.saveProject(validateProjectPayload(value))
  );
  handle("storage:delete-project", (id: string) =>
    database.deleteProject(id)
  );

  handle(
    "storage:load-personalization",
    (): PersonalizationSettings => database.loadPersonalization()
  );
  handle("storage:save-personalization", (value: unknown) =>
    database.savePersonalization(value)
  );
  handle("storage:load-memories", (): MemoryEntry[] =>
    database.loadMemories()
  );
  handle("storage:save-memories", (value: unknown) =>
    database.saveMemories(value)
  );
  handle(
    "storage:import-legacy",
    (value: unknown): LegacyImportResult =>
      database.importLegacyData(validateLegacySnapshot(value))
  );

  handle("skills:list", async (): Promise<SkillSummary[]> => {
    const preferences = database.loadSkillsPreferences();
    return skills.list(preferences);
  });

  handle(
    "skills:set-enabled",
    async (name: string, enabled: boolean): Promise<SkillSummary[]> => {
      const normalized = normalizeSkillName(name);
      if (!normalized) {
        throw new Error("نام مهارت نامعتبر است.");
      }

      const preferences = database.loadSkillsPreferences();
      const disabled = new Set(preferences.disabledSkillNames);
      if (enabled) {
        disabled.delete(normalized);
      } else {
        disabled.add(normalized);
      }
      database.saveSkillsPreferences({
        disabledSkillNames: [...disabled],
      } satisfies SkillsPreferences);

      return skills.list(database.loadSkillsPreferences());
    }
  );

  handle(
    "skills:get-body",
    async (name: string): Promise<SkillDocument | null> =>
      skills.getSkillBody(name)
  );

  handle("skills:create", async (value: unknown): Promise<SkillSummary[]> => {
    await skills.create(value);
    return skills.list(database.loadSkillsPreferences());
  });

  handle(
    "skills:update",
    async (name: string, value: unknown): Promise<SkillSummary[]> => {
      await skills.update(name, value);
      return skills.list(database.loadSkillsPreferences());
    }
  );

  handle("skills:delete", async (name: string): Promise<SkillSummary[]> => {
    await skills.delete(name);
    const preferences = sanitizeSkillsPreferences(
      database.loadSkillsPreferences()
    );
    const normalized = normalizeSkillName(name);
    if (normalized) {
      database.saveSkillsPreferences({
        disabledSkillNames: preferences.disabledSkillNames.filter(
          (item) => item !== normalized
        ),
      });
    }
    return skills.list(database.loadSkillsPreferences());
  });

  handle("updates:get-version", () => getAppVersion());
  handle("updates:check", () => checkForAppUpdate());
  handle("updates:open-url", (url: string) => openExternalUrl(url));

  registerWindowControlHandlers(getMainWindow);
}
