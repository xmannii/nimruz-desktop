import { dialog, ipcMain, type IpcMainInvokeEvent } from "electron";
import { realpathSync, statSync } from "node:fs";
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
import {
  normalizeWorkspaceTrust,
  sanitizeWorkspace,
  type TaskRecord,
  type WorkspaceRoot,
} from "@/lib/workspace";
import type { WorkspaceFilesStore } from "./agent/workspace-files";
import type { WorkspaceEventBus } from "./agent/events";
import { CredentialService } from "./credentials";
import { AppDatabase } from "./storage/database";
import { SkillStore } from "./skills/store";
import { registerWindowControlHandlers } from "./window-controls";
import {
  validateChatsPayload,
  validateLegacySnapshot,
  validateWorkspacePayload,
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
  workspaceFiles: WorkspaceFilesStore;
  workspaceEvents: WorkspaceEventBus;
  sessionToken: string;
  getMainWindow: () => import("electron").BrowserWindow | null;
}) {
  const {
    database,
    credentials,
    skills,
    workspaceFiles,
    workspaceEvents,
    sessionToken,
    getMainWindow,
  } = options;

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
  handle("storage:delete-all-chats", () => database.deleteAllChats());

  handle("storage:load-workspaces", () => database.loadWorkspaces());
  handle("storage:save-workspace", (value: unknown) => {
    const workspace = validateWorkspacePayload(value);
    database.saveWorkspace(workspace);
    workspaceFiles.ensureManagedRoot(workspace.id);
  });
  handle("storage:delete-workspace", (id: string) =>
    database.deleteWorkspace(id)
  );
  handle("storage:load-projects", () => database.loadWorkspaces());
  handle("storage:save-project", (value: unknown) => {
    const workspace = validateWorkspacePayload(value);
    database.saveWorkspace(workspace);
    workspaceFiles.ensureManagedRoot(workspace.id);
  });
  handle("storage:delete-project", (id: string) =>
    database.deleteWorkspace(id)
  );

  handle("storage:load-workspace-roots", (workspaceId: string) => {
    workspaceFiles.ensureManagedRoot(workspaceId);
    return database.loadWorkspaceRoots(workspaceId);
  });

  handle("storage:pick-directory", async () => {
    const window = getMainWindow();
    const result = await dialog.showOpenDialog(window ?? undefined!, {
      properties: ["openDirectory"],
      title: "انتخاب پوشه",
    });
    if (result.canceled || !result.filePaths[0]) return null;
    return { path: result.filePaths[0] };
  });

  handle(
    "storage:add-linked-workspace-root",
    async (
      workspaceId: string,
      options?: { path?: string; makePrimary?: boolean }
    ) => {
      if (!/^[\w-]{1,128}$/.test(workspaceId)) {
        throw new Error("Invalid workspace id.");
      }
      if (!database.getWorkspace(workspaceId)) {
        throw new Error("Workspace not found.");
      }

      let rootPath = options?.path;
      if (!rootPath) {
        const window = getMainWindow();
        const result = await dialog.showOpenDialog(window ?? undefined!, {
          properties: ["openDirectory"],
          title: "انتخاب پوشه فضای کاری",
        });
        if (result.canceled || !result.filePaths[0]) return null;
        rootPath = result.filePaths[0];
      }

      // Canonicalize and validate the selected folder before persisting.
      let canonicalPath: string;
      try {
        canonicalPath = realpathSync.native(rootPath);
        const stats = statSync(canonicalPath);
        if (!stats.isDirectory()) {
          throw new Error("انتخاب باید یک پوشه باشد.");
        }
      } catch (error) {
        throw new Error(
          error instanceof Error && error.message.includes("پوشه")
            ? error.message
            : "پوشه انتخاب‌شده در دسترس نیست."
        );
      }

      const existingRoots = database.loadWorkspaceRoots(workspaceId);
      const duplicate = existingRoots.find(
        (item) => item.path === canonicalPath
      );
      if (duplicate) {
        if (options?.makePrimary) {
          return database
            .setPrimaryWorkspaceRoot(workspaceId, duplicate.id)
            .find((item) => item.id === duplicate.id);
        }
        return duplicate;
      }

      const root: WorkspaceRoot = {
        id: nanoid(),
        workspaceId,
        kind: "linked",
        path: canonicalPath,
        label:
          canonicalPath.split(/[/\\]/).filter(Boolean).at(-1) ?? canonicalPath,
        isPrimary: false,
        createdAt: Date.now(),
      };
      database.saveWorkspaceRoot(root);
      if (options?.makePrimary) {
        const updated = database
          .setPrimaryWorkspaceRoot(workspaceId, root.id)
          .find((item) => item.id === root.id);
        workspaceEvents.emit({ type: "root-changed", workspaceId });
        return updated;
      }
      workspaceEvents.emit({ type: "root-changed", workspaceId });
      return root;
    }
  );

  handle(
    "storage:set-primary-workspace-root",
    (workspaceId: string, rootId: string) => {
      if (!database.getWorkspace(workspaceId)) {
        throw new Error("Workspace not found.");
      }
      const roots = database.setPrimaryWorkspaceRoot(workspaceId, rootId);
      workspaceEvents.emit({ type: "root-changed", workspaceId });
      return roots;
    }
  );

  handle("storage:remove-workspace-root", (rootId: string) => {
    const roots = database.loadWorkspaceRoots();
    const root = roots.find((item) => item.id === rootId);
    if (!root) return;
    if (root.kind === "managed") {
      throw new Error("Managed workspace root cannot be removed.");
    }
    database.deleteWorkspaceRoot(rootId);
    workspaceEvents.emit({
      type: "root-changed",
      workspaceId: root.workspaceId,
    });
  });

  handle(
    "storage:update-workspace-trust",
    (workspaceId: string, trust: unknown) => {
      const workspace = database.getWorkspace(workspaceId);
      if (!workspace) throw new Error("Workspace not found.");
      const updated = sanitizeWorkspace({
        ...workspace,
        trust: normalizeWorkspaceTrust(trust),
        updatedAt: Date.now(),
      });
      database.saveWorkspace(updated);
      return updated;
    }
  );

  handle(
    "storage:list-workspace-files",
    (workspaceId: string, dirPath?: string) =>
      workspaceFiles.listDirectory(workspaceId, dirPath ?? ".")
  );
  handle("storage:read-workspace-file", (workspaceId: string, filePath: string) =>
    workspaceFiles.readFileText(workspaceId, filePath)
  );
  handle(
    "storage:read-workspace-file-binary",
    (workspaceId: string, filePath: string) =>
      workspaceFiles.readBinaryFile(workspaceId, filePath)
  );
  handle(
    "storage:search-workspace-files",
    (
      workspaceId: string,
      query: string,
      options?: { glob?: string; maxMatches?: number }
    ) => workspaceFiles.searchFiles(workspaceId, query, options)
  );
  handle(
    "storage:import-workspace-files",
    (
      workspaceId: string,
      files: Array<{ name: string; base64: string; mimeType?: string }>
    ) => workspaceFiles.importFiles(workspaceId, files)
  );
  handle(
    "storage:create-workspace-directory",
    (workspaceId: string, dirPath: string) =>
      workspaceFiles.createDirectory(workspaceId, dirPath)
  );
  handle(
    "storage:create-workspace-file",
    (workspaceId: string, filePath: string, content?: string) =>
      workspaceFiles.writeFile(workspaceId, filePath, content ?? "")
  );
  handle(
    "storage:rename-workspace-entry",
    (workspaceId: string, fromPath: string, toPath: string) =>
      workspaceFiles.moveFile(workspaceId, fromPath, toPath)
  );
  handle(
    "storage:delete-workspace-entry",
    (workspaceId: string, targetPath: string) =>
      workspaceFiles.deleteFile(workspaceId, targetPath)
  );
  handle(
    "storage:reveal-workspace-path",
    async (workspaceId: string, targetPath: string) => {
      // Confirm the path is inside an approved root before revealing it.
      const resolved = workspaceFiles.assertInsideRoots(workspaceId, targetPath);
      const { shell } = await import("electron");
      shell.showItemInFolder(resolved);
    }
  );

  handle("storage:list-artifacts", (workspaceId: string) =>
    database.listArtifacts(workspaceId)
  );
  handle("storage:read-artifact", (workspaceId: string, artifactId: string) => {
    const artifact = database
      .listArtifacts(workspaceId)
      .find((item) => item.id === artifactId);
    if (!artifact) throw new Error("Artifact not found.");
    return workspaceFiles.readArtifactByRecord(artifact);
  });
  handle("storage:delete-artifact", (artifactId: string) => {
    const workspaceId = database.getArtifactWorkspaceId(artifactId);
    database.deleteArtifact(artifactId);
    if (workspaceId) {
      workspaceEvents.emit({ type: "artifact-changed", workspaceId, artifactId });
    }
  });

  handle("storage:list-tasks", (workspaceId: string) =>
    database.listTasks(workspaceId)
  );
  handle("storage:save-task", (value: unknown) => {
    const task = value as TaskRecord;
    database.saveTask(task);
    if (task.workspaceId) {
      workspaceEvents.emit({
        type: "task-changed",
        workspaceId: task.workspaceId,
        taskId: task.id,
      });
    }
    return task;
  });
  handle("storage:delete-task", (taskId: string) => {
    const workspaceId = database.getTaskWorkspaceId(taskId);
    database.deleteTask(taskId);
    if (workspaceId) {
      workspaceEvents.emit({ type: "task-changed", workspaceId, taskId });
    }
  });

  handle(
    "storage:list-agent-runs",
    (options?: { workspaceId?: string; chatId?: string; limit?: number }) =>
      database.listAgentRuns(options)
  );
  handle("storage:get-agent-run", (runId: string) => {
    const run = database.getAgentRun(runId);
    if (!run) return null;
    return {
      run,
      steps: database.listAgentRunSteps(runId),
      toolCalls: database.listToolCalls(runId),
      approvals: database.listApprovals(runId),
    };
  });

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
