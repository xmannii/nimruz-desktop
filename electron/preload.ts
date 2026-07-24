import { contextBridge, ipcRenderer } from "electron";
import type { CodexAccountStatus } from "@/lib/codex";
import type {
  DesktopAPI,
  NotificationOpenChatPayload,
  WindowState,
} from "@/lib/desktop-api";
import type {
  CompanionConversationSnapshot,
  CompanionOpenChatRequest,
  CompanionPromptRequest,
  CompanionSubmissionStatus,
} from "@/lib/companion";
import type { CompanionShortcutStatus } from "@/lib/settings/companion";
import {
  NOTIFICATION_OPEN_CHAT_CHANNEL,
  NOTIFICATION_PLAY_SOUND_CHANNEL,
} from "./notifications/service";

const desktopApi: DesktopAPI = {
  platform: process.platform,
  isDesktop: true,
  auth: {
    getSessionToken: () => ipcRenderer.invoke("auth:get-session-token"),
  },
  git: {
    status: (workspaceId, chatId) =>
      ipcRenderer.invoke("git:status", workspaceId, chatId),
    stage: (workspaceId, paths, chatId) =>
      ipcRenderer.invoke("git:stage", workspaceId, paths, chatId),
    unstage: (workspaceId, paths, chatId) =>
      ipcRenderer.invoke("git:unstage", workspaceId, paths, chatId),
    discard: (workspaceId, relativePath, chatId) =>
      ipcRenderer.invoke("git:discard", workspaceId, relativePath, chatId),
    commit: (workspaceId, message, chatId) =>
      ipcRenderer.invoke("git:commit", workspaceId, message, chatId),
    update: (workspaceId, chatId) =>
      ipcRenderer.invoke("git:update", workspaceId, chatId),
    merge: (workspaceId, branch, chatId) =>
      ipcRenderer.invoke("git:merge", workspaceId, branch, chatId),
    abortMerge: (workspaceId, chatId) =>
      ipcRenderer.invoke("git:abort-merge", workspaceId, chatId),
  },
  window: {
    minimize: () => ipcRenderer.invoke("window:minimize"),
    toggleMaximize: () => ipcRenderer.invoke("window:toggle-maximize"),
    close: () => ipcRenderer.invoke("window:close"),
    getState: () => ipcRenderer.invoke("window:get-state"),
    onStateChange: (callback) => {
      const handler = (_event: Electron.IpcRendererEvent, state: WindowState) =>
        callback(state);
      ipcRenderer.on("window:state-changed", handler);
      return () => {
        ipcRenderer.removeListener("window:state-changed", handler);
      };
    },
  },
  notifications: {
    getSettings: () => ipcRenderer.invoke("notifications:get-settings"),
    saveSettings: (settings) =>
      ipcRenderer.invoke("notifications:save-settings", settings),
    onPlayCompletionSound: (callback) => {
      const handler = () => callback();
      ipcRenderer.on(NOTIFICATION_PLAY_SOUND_CHANNEL, handler);
      return () => {
        ipcRenderer.removeListener(NOTIFICATION_PLAY_SOUND_CHANNEL, handler);
      };
    },
    onOpenChat: (callback) => {
      const handler = (
        _event: Electron.IpcRendererEvent,
        payload: NotificationOpenChatPayload
      ) => callback(payload);
      ipcRenderer.on(NOTIFICATION_OPEN_CHAT_CHANNEL, handler);
      return () => {
        ipcRenderer.removeListener(NOTIFICATION_OPEN_CHAT_CHANNEL, handler);
      };
    },
  },
  companion: {
    hide: () => ipcRenderer.invoke("companion:hide"),
    quit: () => ipcRenderer.invoke("companion:quit"),
    openMain: (target) => ipcRenderer.invoke("companion:open-main", target),
    captureScreen: () => ipcRenderer.invoke("companion:capture-screen"),
    submit: (draft) => ipcRenderer.invoke("companion:submit", draft),
    reportStatus: (status) =>
      ipcRenderer.invoke("companion:report-status", status),
    reportConversation: (snapshot) =>
      ipcRenderer.invoke("companion:report-conversation", snapshot),
    clearConversation: () =>
      ipcRenderer.invoke("companion:clear-conversation"),
    getScreenCapturePermission: () =>
      ipcRenderer.invoke("companion:get-screen-capture-permission"),
    openScreenCaptureSettings: () =>
      ipcRenderer.invoke("companion:open-screen-capture-settings"),
    getShortcutStatus: () =>
      ipcRenderer.invoke("companion:get-shortcut-status"),
    setShortcutSettings: (settings) =>
      ipcRenderer.invoke("companion:set-shortcut-settings", settings),
    onPrompt: (callback) => {
      const handler = (
        _event: Electron.IpcRendererEvent,
        request: CompanionPromptRequest
      ) => callback(request);
      ipcRenderer.on("companion:prompt", handler);
      return () => ipcRenderer.removeListener("companion:prompt", handler);
    },
    onSubmissionStatus: (callback) => {
      const handler = (
        _event: Electron.IpcRendererEvent,
        status: CompanionSubmissionStatus
      ) => callback(status);
      ipcRenderer.on("companion:submission-status", handler);
      return () =>
        ipcRenderer.removeListener("companion:submission-status", handler);
    },
    onConversation: (callback) => {
      const handler = (
        _event: Electron.IpcRendererEvent,
        snapshot: CompanionConversationSnapshot
      ) => callback(snapshot);
      ipcRenderer.on("companion:conversation", handler);
      return () => ipcRenderer.removeListener("companion:conversation", handler);
    },
    onClearConversation: (callback) => {
      const handler = () => callback();
      ipcRenderer.on("companion:clear-conversation", handler);
      return () =>
        ipcRenderer.removeListener("companion:clear-conversation", handler);
    },
    onOpenChat: (callback) => {
      const handler = (
        _event: Electron.IpcRendererEvent,
        target: CompanionOpenChatRequest
      ) => callback(target);
      ipcRenderer.on("companion:open-chat", handler);
      return () => ipcRenderer.removeListener("companion:open-chat", handler);
    },
    onVisibilityChange: (callback) => {
      const handler = (_event: Electron.IpcRendererEvent, visible: boolean) =>
        callback(visible);
      ipcRenderer.on("companion:visibility", handler);
      return () => ipcRenderer.removeListener("companion:visibility", handler);
    },
    onShortcutStatus: (callback) => {
      const handler = (
        _event: Electron.IpcRendererEvent,
        status: CompanionShortcutStatus
      ) => callback(status);
      ipcRenderer.on("companion:shortcut-status", handler);
      return () =>
        ipcRenderer.removeListener("companion:shortcut-status", handler);
    },
    onToggleMicrophone: (callback) => {
      const handler = () => callback();
      ipcRenderer.on("companion:toggle-microphone", handler);
      return () =>
        ipcRenderer.removeListener("companion:toggle-microphone", handler);
    },
  },
  credentials: {
    getStatus: (providerId) =>
      ipcRenderer.invoke("credentials:status", providerId),
    setKey: (providerId, key) =>
      ipcRenderer.invoke("credentials:set-key", providerId, key),
    clearKey: (providerId) =>
      ipcRenderer.invoke("credentials:clear-key", providerId),
    testProvider: (options) =>
      ipcRenderer.invoke("credentials:test-provider", options),
    setOpenRouterKey: (key) =>
      ipcRenderer.invoke("credentials:set-openrouter", key),
    clearOpenRouterKey: () =>
      ipcRenderer.invoke("credentials:clear-openrouter"),
    testOpenRouterKey: (key) =>
      ipcRenderer.invoke("credentials:test-openrouter", key),
  },
  codex: {
    getStatus: (refreshToken) =>
      ipcRenderer.invoke("codex:status", refreshToken),
    startLogin: (flow) => ipcRenderer.invoke("codex:login", flow),
    cancelLogin: (loginId) =>
      ipcRenderer.invoke("codex:login-cancel", loginId),
    logout: () => ipcRenderer.invoke("codex:logout"),
    waitForChatIdle: (chatId) =>
      ipcRenderer.invoke("codex:wait-chat-idle", chatId),
    syncModels: () => ipcRenderer.invoke("codex:sync-models"),
    onStatusChange: (callback) => {
      const handler = (
        _event: Electron.IpcRendererEvent,
        status: CodexAccountStatus
      ) => callback(status);
      ipcRenderer.on("codex:status-changed", handler);
      return () => {
        ipcRenderer.removeListener("codex:status-changed", handler);
      };
    },
  },
  speech: {
    shenava: {
      getStatus: () => ipcRenderer.invoke("speech:shenava:status"),
      download: (modelKey) =>
        ipcRenderer.invoke("speech:shenava:download", modelKey),
      cancelDownload: () =>
        ipcRenderer.invoke("speech:shenava:cancel-download"),
      select: (modelKey) =>
        ipcRenderer.invoke("speech:shenava:select", modelKey),
      remove: (modelKey) =>
        ipcRenderer.invoke("speech:shenava:remove", modelKey),
      reveal: (modelKey) =>
        ipcRenderer.invoke("speech:shenava:reveal", modelKey),
      transcribe: (audioBuffer) =>
        ipcRenderer.invoke("speech:shenava:transcribe", audioBuffer),
      onStatusChange: (callback) => {
        const handler = (
          _event: Electron.IpcRendererEvent,
          status: import("@/lib/speech/shenava").ShenavaStatus
        ) => callback(status);
        ipcRenderer.on("speech:shenava:status-changed", handler);
        return () => {
          ipcRenderer.removeListener(
            "speech:shenava:status-changed",
            handler
          );
        };
      },
    },
  },
  providers: {
    listCatalog: () => ipcRenderer.invoke("providers:list-catalog"),
    saveProvider: (provider) =>
      ipcRenderer.invoke("providers:save-provider", provider),
    deleteProvider: (id) => ipcRenderer.invoke("providers:delete-provider", id),
    saveModel: (model) => ipcRenderer.invoke("providers:save-model", model),
    deleteModel: (id) => ipcRenderer.invoke("providers:delete-model", id),
    deleteProviderModels: (providerId) =>
      ipcRenderer.invoke("providers:delete-provider-models", providerId),
    setDefaultModel: (id) =>
      ipcRenderer.invoke("providers:set-default-model", id),
    discoverModels: (options) =>
      ipcRenderer.invoke("providers:discover-models", options),
  },
  storage: {
    loadChats: () => ipcRenderer.invoke("storage:load-chats"),
    saveChats: (chats) => ipcRenderer.invoke("storage:save-chats", chats),
    deleteChat: (id) => ipcRenderer.invoke("storage:delete-chat", id),
    deleteAllChats: () => ipcRenderer.invoke("storage:delete-all-chats"),
    loadWorkspaces: () => ipcRenderer.invoke("storage:load-workspaces"),
    saveWorkspace: (workspace) =>
      ipcRenderer.invoke("storage:save-workspace", workspace),
    deleteWorkspace: (id) =>
      ipcRenderer.invoke("storage:delete-workspace", id),
    loadProjects: () => ipcRenderer.invoke("storage:load-projects"),
    saveProject: (project) =>
      ipcRenderer.invoke("storage:save-project", project),
    deleteProject: (id) => ipcRenderer.invoke("storage:delete-project", id),
    loadWorkspaceRoots: (workspaceId) =>
      ipcRenderer.invoke("storage:load-workspace-roots", workspaceId),
    pickDirectory: () => ipcRenderer.invoke("storage:pick-directory"),
    addLinkedWorkspaceRoot: (workspaceId, options) =>
      ipcRenderer.invoke(
        "storage:add-linked-workspace-root",
        workspaceId,
        options
      ),
    setPrimaryWorkspaceRoot: (workspaceId, rootId) =>
      ipcRenderer.invoke(
        "storage:set-primary-workspace-root",
        workspaceId,
        rootId
      ),
    removeWorkspaceRoot: (rootId) =>
      ipcRenderer.invoke("storage:remove-workspace-root", rootId),
    updateWorkspaceTrust: (workspaceId, trust) =>
      ipcRenderer.invoke("storage:update-workspace-trust", workspaceId, trust),
    listMcpServers: (workspaceId) =>
      ipcRenderer.invoke("storage:list-mcp-servers", workspaceId),
    saveMcpServer: (server) =>
      ipcRenderer.invoke("storage:save-mcp-server", server),
    deleteMcpServer: (workspaceId, serverId) =>
      ipcRenderer.invoke(
        "storage:delete-mcp-server",
        workspaceId,
        serverId
      ),
    testMcpServer: (server) =>
      ipcRenderer.invoke("storage:test-mcp-server", server),
    listWorkspaceFiles: (workspaceId, path, chatId) =>
      ipcRenderer.invoke(
        "storage:list-workspace-files",
        workspaceId,
        path,
        chatId
      ),
    readWorkspaceFile: (workspaceId, path, chatId) =>
      ipcRenderer.invoke(
        "storage:read-workspace-file",
        workspaceId,
        path,
        chatId
      ),
    readWorkspaceFileBinary: (workspaceId, path, chatId) =>
      ipcRenderer.invoke(
        "storage:read-workspace-file-binary",
        workspaceId,
        path,
        chatId
      ),
    listWorkspaceChanges: (workspaceId, chatId) =>
      ipcRenderer.invoke(
        "storage:list-workspace-changes",
        workspaceId,
        chatId
      ),
    searchWorkspaceFiles: (workspaceId, query, options, chatId) =>
      ipcRenderer.invoke(
        "storage:search-workspace-files",
        workspaceId,
        query,
        options,
        chatId
      ),
    importWorkspaceFiles: (workspaceId, files) =>
      ipcRenderer.invoke(
        "storage:import-workspace-files",
        workspaceId,
        files
      ),
    createWorkspaceDirectory: (workspaceId, path, chatId) =>
      ipcRenderer.invoke(
        "storage:create-workspace-directory",
        workspaceId,
        path,
        chatId
      ),
    createWorkspaceFile: (workspaceId, path, content, chatId) =>
      ipcRenderer.invoke(
        "storage:create-workspace-file",
        workspaceId,
        path,
        content,
        chatId
      ),
    renameWorkspaceEntry: (workspaceId, from, to, chatId) =>
      ipcRenderer.invoke(
        "storage:rename-workspace-entry",
        workspaceId,
        from,
        to,
        chatId
      ),
    deleteWorkspaceEntry: (workspaceId, path, chatId) =>
      ipcRenderer.invoke(
        "storage:delete-workspace-entry",
        workspaceId,
        path,
        chatId
      ),
    revealWorkspacePath: (workspaceId, path, chatId) =>
      ipcRenderer.invoke(
        "storage:reveal-workspace-path",
        workspaceId,
        path,
        chatId
      ),
    getChatWorktree: (chatId) =>
      ipcRenderer.invoke("storage:get-chat-worktree", chatId),
    listTurnCheckpoints: (chatId) =>
      ipcRenderer.invoke("storage:list-turn-checkpoints", chatId),
    getTurnCheckpointDiff: (runId) =>
      ipcRenderer.invoke("storage:get-turn-checkpoint-diff", runId),
    restoreTurnCheckpoint: (runId) =>
      ipcRenderer.invoke("storage:restore-turn-checkpoint", runId),
    listArtifacts: (workspaceId) =>
      ipcRenderer.invoke("storage:list-artifacts", workspaceId),
    readArtifact: (workspaceId, artifactId) =>
      ipcRenderer.invoke("storage:read-artifact", workspaceId, artifactId),
    deleteArtifact: (artifactId) =>
      ipcRenderer.invoke("storage:delete-artifact", artifactId),
    listTasks: (workspaceId) =>
      ipcRenderer.invoke("storage:list-tasks", workspaceId),
    saveTask: (task) => ipcRenderer.invoke("storage:save-task", task),
    deleteTask: (taskId) => ipcRenderer.invoke("storage:delete-task", taskId),
    listPlans: (workspaceId) =>
      ipcRenderer.invoke("storage:list-plans", workspaceId),
    savePlan: (plan) => ipcRenderer.invoke("storage:save-plan", plan),
    deletePlan: (planId) => ipcRenderer.invoke("storage:delete-plan", planId),
    listAgentRuns: (options) =>
      ipcRenderer.invoke("storage:list-agent-runs", options),
    getAgentRun: (runId) => ipcRenderer.invoke("storage:get-agent-run", runId),
    listQueuedChatMessages: (chatId) =>
      ipcRenderer.invoke("storage:list-queued-chat-messages", chatId),
    enqueueChatMessage: (chatId, text, kind) =>
      ipcRenderer.invoke("storage:enqueue-chat-message", chatId, text, kind),
    shiftQueuedChatMessage: (chatId) =>
      ipcRenderer.invoke("storage:shift-queued-chat-message", chatId),
    deleteQueuedChatMessage: (id) =>
      ipcRenderer.invoke("storage:delete-queued-chat-message", id),
    resolveRunApproval: (approvalId, decision) =>
      ipcRenderer.invoke(
        "storage:resolve-run-approval",
        approvalId,
        decision
      ),
    loadOnboardingCompleted: () =>
      ipcRenderer.invoke("storage:load-onboarding-completed"),
    saveOnboardingCompleted: (completed) =>
      ipcRenderer.invoke("storage:save-onboarding-completed", completed),
    loadLastSeenVersion: () =>
      ipcRenderer.invoke("storage:load-last-seen-version"),
    saveLastSeenVersion: (version) =>
      ipcRenderer.invoke("storage:save-last-seen-version", version),
    loadActiveWorkspaceId: () =>
      ipcRenderer.invoke("storage:load-active-workspace-id"),
    saveActiveWorkspaceId: (workspaceId) =>
      ipcRenderer.invoke("storage:save-active-workspace-id", workspaceId),
    loadPersonalization: () =>
      ipcRenderer.invoke("storage:load-personalization"),
    savePersonalization: (settings) =>
      ipcRenderer.invoke("storage:save-personalization", settings),
    loadAppearance: () => ipcRenderer.invoke("storage:load-appearance"),
    saveAppearance: (settings) =>
      ipcRenderer.invoke("storage:save-appearance", settings),
    loadMemories: () => ipcRenderer.invoke("storage:load-memories"),
    saveMemories: (memories) =>
      ipcRenderer.invoke("storage:save-memories", memories),
    loadExperts: () => ipcRenderer.invoke("storage:load-experts"),
    saveExperts: (experts) => ipcRenderer.invoke("storage:save-experts", experts),
    loadSubagents: () => ipcRenderer.invoke("storage:load-subagents"),
    saveSubagents: (models) =>
      ipcRenderer.invoke("storage:save-subagents", models),
    importLegacyData: (snapshot) =>
      ipcRenderer.invoke("storage:import-legacy", snapshot),
  },
  skills: {
    list: () => ipcRenderer.invoke("skills:list"),
    setEnabled: (name, enabled) =>
      ipcRenderer.invoke("skills:set-enabled", name, enabled),
    getBody: (name) => ipcRenderer.invoke("skills:get-body", name),
    create: (skill) => ipcRenderer.invoke("skills:create", skill),
    update: (name, skill) =>
      ipcRenderer.invoke("skills:update", name, skill),
    delete: (name) => ipcRenderer.invoke("skills:delete", name),
  },
  fonts: {
    list: () => ipcRenderer.invoke("fonts:list"),
  },
  updates: {
    getVersion: () => ipcRenderer.invoke("updates:get-version"),
    check: () => ipcRenderer.invoke("updates:check"),
    openUrl: (url) => ipcRenderer.invoke("updates:open-url", url),
  },
  workspaceEvents: {
    subscribe: (callback) => {
      const handler = (
        _event: Electron.IpcRendererEvent,
        payload: import("@/lib/workspace").WorkspaceEvent
      ) => callback(payload);
      ipcRenderer.on("workspace:event", handler);
      return () => {
        ipcRenderer.removeListener("workspace:event", handler);
      };
    },
  },
};

contextBridge.exposeInMainWorld("desktop", desktopApi);
