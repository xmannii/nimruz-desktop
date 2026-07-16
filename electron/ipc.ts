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
import { advanceMission, canTransitionMission, createMission, isMissionStatus, planMission, startMission, type Mission, type MissionEvent } from "@/lib/missions/types";
import {
  OPENROUTER_PROVIDER_ID,
  PROVIDER_LIMITS,
} from "@/lib/models/catalog";
import { CredentialService } from "./credentials";
import { AppDatabase } from "./storage/database";
import { SkillStore } from "./skills/store";
import { executeWorkspaceTool, type ToolResult } from "./missions/workspace-tools";
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

const activeMissionRuns = new Set<string>();

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
  handle("storage:load-experts", () => database.loadExperts());
  handle("storage:save-experts", (value: unknown) => database.saveExperts(value));
  handle("missions:list", (): Mission[] => database.loadMissions());
  handle("missions:create", (value: unknown): Mission[] => {
    const mission = createMission(value);
    database.createMission(mission);
    return database.loadMissions();
  });
  handle("missions:set-status", (id: string, status: string): Mission[] => {
    if (!isMissionStatus(status)) throw new Error("Invalid mission status.");
    const mission = database.loadMissions().find((item) => item.id === id);
    if (!mission) throw new Error("Mission not found.");
    if (!canTransitionMission(mission.status, status)) throw new Error(`Cannot change mission from ${mission.status} to ${status}.`);
    database.updateMissionStatus(id, status);
    return database.loadMissions();
  });
  handle("missions:events", (id: string): MissionEvent[] => database.loadMissionEvents(id));
  handle("missions:plan", (id: string): Mission[] => {
    const mission = database.loadMissions().find((item) => item.id === id);
    if (!mission) throw new Error("Mission not found.");
    const planned = database.replaceMissionSteps(id, planMission(mission));
    if (!planned) throw new Error("Mission not found.");
    return database.loadMissions();
  });
  handle("missions:confirm-plan", (id: string): Mission[] => {
    if (!database.updateMissionStatus(id, "waiting_for_confirmation")) throw new Error("Mission not found.");
    return database.loadMissions();
  });
  handle("missions:start", (id: string): Mission[] => {
    const mission = database.loadMissions().find((item) => item.id === id);
    if (!mission) throw new Error("Mission not found.");
    database.saveMissionSnapshot(startMission(mission));
    return database.loadMissions();
  });
  handle("missions:advance", (id: string): Mission[] => {
    const mission = database.loadMissions().find((item) => item.id === id);
    if (!mission) throw new Error("Mission not found.");
    database.saveMissionSnapshot(advanceMission(mission));
    return database.loadMissions();
  });
  handle("missions:execute-step", async (id: string): Promise<Mission[]> => {
    const mission = database.loadMissions().find((item) => item.id === id);
    if (!mission) throw new Error("Mission not found.");
    const current = mission.steps.find((step) => step.status === "running");
    if (!current) throw new Error("مراحل در حال اجرا پیدا نشد.");
    if (current.requiresApproval) {
      database.updateMissionStatus(id, "waiting_for_approval");
      return database.loadMissions();
    }
    try {
      const result = current.tool
        ? await executeWorkspaceTool(current.tool, current.input, mission.workspacePath)
        : { success: true, summary: "این مرحله برای ابزار مشخصی تنظیم نشده بود." };
      const nextPending = mission.steps.find((step) => step.status === "pending");
      const now = Date.now();
      const updated = { ...mission, steps: mission.steps.map((step) => step.id === current.id ? { ...step, status: result.success ? "completed" as const : "failed" as const, output: { summary: result.summary, ...(result.data ? { data: result.data } : {}) }, error: result.error ?? null, completedAt: result.success ? now : null } : result.success && nextPending && step.id === nextPending.id ? { ...step, status: "running" as const, startedAt: now } : step), status: result.success ? nextPending ? "running" as const : "completed" as const : "failed" as const, updatedAt: now };
      database.saveMissionSnapshot(updated);
      return database.loadMissions();
    } catch (error) {
      database.saveMissionSnapshot({ ...mission, status: "failed", steps: mission.steps.map((step) => step.id === current.id ? { ...step, status: "failed", error: error instanceof Error ? error.message : "اجرای ابزار ناموفق بود." } : step), updatedAt: Date.now() });
      throw error;
    }
  });
  handle("missions:run", async (id: string): Promise<Mission[]> => {
    if (activeMissionRuns.has(id)) throw new Error("این مأموریت هم‌اکنون در حال اجراست.");
    activeMissionRuns.add(id);
    try {
    let mission: Mission | undefined = database.loadMissions().find((item) => item.id === id);
    if (!mission) throw new Error("Mission not found.");
    if (mission.status === "waiting_for_confirmation" || mission.status === "paused") {
      mission = startMission(mission);
      database.saveMissionSnapshot(mission);
    }
    while (mission.status === "running") {
      const current: Mission["steps"][number] | undefined = mission.steps.find((step) => step.status === "running");
      if (!current) break;
      if (current.requiresApproval) {
        database.updateMissionStatus(id, "waiting_for_approval");
        database.recordMissionEvent(id, "mission.approval_requested", "برای ادامه این اقدام به تأیید نیاز است.", { stepId: current.id, tool: current.tool });
        break;
      }
      const result: ToolResult = current.tool
        ? await executeWorkspaceTool(current.tool, current.input, mission.workspacePath)
        : { success: true, summary: "این مرحله بدون ابزار اجرا شد." };
      const now = Date.now();
      const next: Mission["steps"][number] | undefined = mission.steps.find((step) => step.status === "pending");
      mission = { ...mission, status: result.success ? next ? "running" : "completed" : "failed", updatedAt: now, steps: mission.steps.map((step) => step.id === current.id ? { ...step, status: result.success ? "completed" as const : "failed" as const, output: { summary: result.summary, ...(result.data ? { data: result.data } : {}) }, error: result.error ?? null, completedAt: result.success ? now : null } : result.success && next && step.id === next.id ? { ...step, status: "running" as const, startedAt: now } : step) };
      database.saveMissionSnapshot(mission);
      database.recordMissionEvent(id, result.success ? "step.completed" : "step.failed", result.summary, { stepId: current.id, tool: current.tool });
    }
    return database.loadMissions();
    } finally { activeMissionRuns.delete(id); }
  });
  handle("missions:approve-step", (id: string): Mission[] => {
    const mission = database.loadMissions().find((item) => item.id === id);
    if (!mission) throw new Error("Mission not found.");
    const current = mission.steps.find((step) => step.status === "running");
    if (!current || mission.status !== "waiting_for_approval") throw new Error("No approval is pending.");
    database.saveMissionSnapshot({ ...mission, status: "running", steps: mission.steps.map((step) => step.id === current.id ? { ...step, requiresApproval: false } : step), updatedAt: Date.now() });
    database.recordMissionEvent(id, "mission.approved", "Approval granted; execution can continue.", { stepId: current.id });
    return database.loadMissions();
  });
  handle("missions:retry", (id: string): Mission[] => {
    const mission = database.loadMissions().find((item) => item.id === id);
    if (!mission) throw new Error("Mission not found.");
    const failed = mission.steps.find((step) => step.status === "failed");
    if (!failed) throw new Error("مرحله ناموفق پیدا نشد.");
    database.saveMissionSnapshot({ ...mission, status: "running", steps: mission.steps.map((step) => step.id === failed.id ? { ...step, status: "running", error: null, startedAt: Date.now() } : step), updatedAt: Date.now() });
    return database.loadMissions();
  });
  handle("missions:delete", (id: string): Mission[] => {
    database.deleteMission(id);
    return database.loadMissions();
  });
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
