import type { LocalChat, LocalProject } from "@/lib/chat/storage";
import type {
  CompanionDraft,
  CompanionConversationSnapshot,
  CompanionOpenChatRequest,
  CompanionPromptRequest,
  CompanionScreenshot,
  CompanionScreenCapturePermission,
  CompanionSubmissionStatus,
} from "@/lib/companion";
import type {
  CodexAccountStatus,
  CodexLoginResult,
  CodexModelSyncResult,
} from "@/lib/codex";
import type {
  ModelCatalogSnapshot,
  ModelConfig,
  ModelDiscoveryResult,
  ProviderConfig,
  ProviderTestResult,
} from "@/lib/models/catalog";
import type { MemoryEntry } from "@/lib/settings/memories";
import type { AppearanceSettings } from "@/lib/settings/appearance";
import type { PersonalizationSettings } from "@/lib/settings/personalization";
import type {
  CompanionShortcutSettings,
  CompanionShortcutStatus,
} from "@/lib/settings/companion";
import type { NotificationSettings } from "@/lib/settings/notifications";
import type { SkillDocument, SkillSummary } from "@/lib/skills/types";
import type { UpdateCheckResult } from "@/lib/updates";
import type { Expert } from "@/lib/settings/experts";
import type { SubagentModel } from "@/lib/settings/subagents";
import type {
  ShenavaModelKey,
  ShenavaStatus,
  ShenavaTranscription,
} from "@/lib/speech/shenava";
import type {
  AgentRun,
  AgentRunStep,
  ApprovalRecord,
  ArtifactRecord,
  LocalWorkspace,
  PlanRecord,
  TaskRecord,
  ToolCallRecord,
  WorkspaceFileChange,
  WorkspaceFileEntry,
  WorkspaceEvent,
  WorkspaceRoot,
  WorkspaceTrustSettings,
} from "@/lib/workspace";

export type CredentialStatus = {
  configured: boolean;
  hint: string | null;
  encryptionAvailable: boolean;
  backend: string;
  secure: boolean;
};

export type CredentialTestResult = {
  ok: boolean;
  message: string;
};

export type LegacyDataSnapshot = {
  chats: LocalChat[];
  projects: LocalProject[];
  personalization: PersonalizationSettings;
  memories: MemoryEntry[];
};

export type LegacyImportResult = {
  imported: boolean;
  chats: number;
  projects: number;
  memories: number;
};

export type WindowState = {
  maximized: boolean;
  fullscreen: boolean;
};

export type AgentRunSnapshot = {
  run: AgentRun;
  steps: AgentRunStep[];
  toolCalls: ToolCallRecord[];
  approvals: ApprovalRecord[];
};

export type NotificationOpenChatPayload = {
  chatId: string;
  workspaceId: string | null;
};

export type DesktopAPI = {
  platform: NodeJS.Platform;
  isDesktop: true;
  auth: {
    getSessionToken: () => Promise<string>;
  };
  window: {
    minimize: () => Promise<void>;
    toggleMaximize: () => Promise<WindowState>;
    close: () => Promise<void>;
    getState: () => Promise<WindowState>;
    onStateChange: (callback: (state: WindowState) => void) => () => void;
  };
  notifications: {
    getSettings: () => Promise<NotificationSettings>;
    saveSettings: (
      settings: NotificationSettings
    ) => Promise<NotificationSettings>;
    onPlayCompletionSound: (callback: () => void) => () => void;
    onOpenChat: (
      callback: (payload: NotificationOpenChatPayload) => void
    ) => () => void;
  };
  companion: {
    hide: () => Promise<void>;
    quit: () => Promise<void>;
    openMain: (target?: CompanionOpenChatRequest) => Promise<void>;
    captureScreen: () => Promise<CompanionScreenshot>;
    submit: (draft: CompanionDraft) => Promise<{ requestId: string }>;
    reportStatus: (status: CompanionSubmissionStatus) => Promise<void>;
    reportConversation: (
      snapshot: CompanionConversationSnapshot
    ) => Promise<void>;
    clearConversation: () => Promise<void>;
    getScreenCapturePermission: () => Promise<CompanionScreenCapturePermission>;
    openScreenCaptureSettings: () => Promise<void>;
    getShortcutStatus: () => Promise<CompanionShortcutStatus>;
    setShortcutSettings: (
      settings: CompanionShortcutSettings
    ) => Promise<CompanionShortcutStatus>;
    onPrompt: (
      callback: (request: CompanionPromptRequest) => void
    ) => () => void;
    onSubmissionStatus: (
      callback: (status: CompanionSubmissionStatus) => void
    ) => () => void;
    onConversation: (
      callback: (snapshot: CompanionConversationSnapshot) => void
    ) => () => void;
    onClearConversation: (callback: () => void) => () => void;
    onOpenChat: (
      callback: (target: CompanionOpenChatRequest) => void
    ) => () => void;
    onVisibilityChange: (callback: (visible: boolean) => void) => () => void;
    onShortcutStatus: (
      callback: (status: CompanionShortcutStatus) => void
    ) => () => void;
    onToggleMicrophone: (callback: () => void) => () => void;
  };
  credentials: {
    getStatus: (providerId?: string) => Promise<CredentialStatus>;
    setKey: (providerId: string, key: string) => Promise<CredentialStatus>;
    clearKey: (providerId: string) => Promise<CredentialStatus>;
    testProvider: (options: {
      providerId?: string;
      baseUrl?: string;
      apiKey?: string;
    }) => Promise<ProviderTestResult>;
    /** @deprecated Use getStatus("openrouter") */
    setOpenRouterKey: (key: string) => Promise<CredentialStatus>;
    clearOpenRouterKey: () => Promise<CredentialStatus>;
    testOpenRouterKey: (key?: string) => Promise<CredentialTestResult>;
  };
  codex: {
    getStatus: (refreshToken?: boolean) => Promise<CodexAccountStatus>;
    startLogin: (flow?: "browser" | "device-code") => Promise<CodexLoginResult>;
    cancelLogin: (loginId: string) => Promise<void>;
    logout: () => Promise<void>;
    syncModels: () => Promise<CodexModelSyncResult>;
    onStatusChange: (callback: (status: CodexAccountStatus) => void) => () => void;
  };
  speech: {
    shenava: {
      getStatus: () => Promise<ShenavaStatus>;
      download: (modelKey: ShenavaModelKey) => Promise<ShenavaStatus>;
      cancelDownload: () => Promise<void>;
      select: (modelKey: ShenavaModelKey) => Promise<ShenavaStatus>;
      remove: (modelKey: ShenavaModelKey) => Promise<ShenavaStatus>;
      reveal: (modelKey: ShenavaModelKey) => Promise<void>;
      transcribe: (audioBuffer: ArrayBuffer) => Promise<ShenavaTranscription>;
      onStatusChange: (
        callback: (status: ShenavaStatus) => void
      ) => () => void;
    };
  };
  providers: {
    listCatalog: () => Promise<ModelCatalogSnapshot>;
    saveProvider: (provider: Partial<ProviderConfig> & { id: string }) => Promise<ProviderConfig>;
    deleteProvider: (id: string) => Promise<void>;
    saveModel: (model: Partial<ModelConfig> & { id: string }) => Promise<ModelConfig>;
    deleteModel: (id: string) => Promise<void>;
    deleteProviderModels: (providerId: string) => Promise<number>;
    setDefaultModel: (id: string) => Promise<ModelConfig>;
    discoverModels: (options: {
      providerId: string;
      baseUrl?: string;
      apiKey?: string;
      import?: boolean;
    }) => Promise<ModelDiscoveryResult & { catalog?: ModelCatalogSnapshot }>;
  };
  storage: {
    loadChats: () => Promise<LocalChat[]>;
    saveChats: (chats: LocalChat[]) => Promise<void>;
    deleteChat: (id: string) => Promise<void>;
    deleteAllChats: () => Promise<void>;
    loadWorkspaces: () => Promise<LocalWorkspace[]>;
    saveWorkspace: (workspace: LocalWorkspace) => Promise<void>;
    deleteWorkspace: (id: string) => Promise<void>;
    /** @deprecated Use loadWorkspaces */
    loadProjects: () => Promise<LocalWorkspace[]>;
    /** @deprecated Use saveWorkspace */
    saveProject: (project: LocalWorkspace) => Promise<void>;
    /** @deprecated Use deleteWorkspace */
    deleteProject: (id: string) => Promise<void>;
    loadWorkspaceRoots: (workspaceId: string) => Promise<WorkspaceRoot[]>;
    pickDirectory: () => Promise<{ path: string } | null>;
    addLinkedWorkspaceRoot: (
      workspaceId: string,
      options?: { path?: string; makePrimary?: boolean }
    ) => Promise<WorkspaceRoot | null>;
    setPrimaryWorkspaceRoot: (
      workspaceId: string,
      rootId: string
    ) => Promise<WorkspaceRoot[]>;
    removeWorkspaceRoot: (rootId: string) => Promise<void>;
    updateWorkspaceTrust: (
      workspaceId: string,
      trust: WorkspaceTrustSettings
    ) => Promise<LocalWorkspace>;
    listWorkspaceFiles: (
      workspaceId: string,
      path?: string
    ) => Promise<WorkspaceFileEntry[]>;
    readWorkspaceFile: (
      workspaceId: string,
      path: string
    ) => Promise<{ path: string; content: string; truncated: boolean; sizeBytes: number }>;
    readWorkspaceFileBinary: (
      workspaceId: string,
      path: string
    ) => Promise<{
      path: string;
      base64: string;
      mimeType: string;
      sizeBytes: number;
    }>;
    listWorkspaceChanges: (
      workspaceId: string
    ) => Promise<WorkspaceFileChange[]>;
    searchWorkspaceFiles: (
      workspaceId: string,
      query: string,
      options?: {
        glob?: string;
        maxMatches?: number;
        scope?: "all" | "filename" | "content";
        path?: string;
        caseSensitive?: boolean;
      }
    ) => Promise<{
      query: string;
      filenameMatches: Array<{
        path: string;
        name: string;
        matchType: "filename" | "content";
        line?: number;
        text: string;
      }>;
      contentMatches: Array<{
        path: string;
        name: string;
        matchType: "filename" | "content";
        line?: number;
        text: string;
      }>;
      matches: Array<{
        path: string;
        name: string;
        matchType: "filename" | "content";
        line?: number;
        text: string;
      }>;
      truncated: boolean;
    }>;
    importWorkspaceFiles: (
      workspaceId: string,
      files: Array<{ name: string; base64: string; mimeType?: string }>
    ) => Promise<
      Array<{
        path: string;
        relativePath: string;
        name: string;
        sizeBytes: number;
        mimeType: string;
      }>
    >;
    createWorkspaceDirectory: (
      workspaceId: string,
      path: string
    ) => Promise<{ path: string }>;
    createWorkspaceFile: (
      workspaceId: string,
      path: string,
      content?: string
    ) => Promise<{ path: string; sizeBytes: number }>;
    renameWorkspaceEntry: (
      workspaceId: string,
      from: string,
      to: string
    ) => Promise<{ from: string; to: string }>;
    deleteWorkspaceEntry: (
      workspaceId: string,
      path: string
    ) => Promise<{ path: string }>;
    revealWorkspacePath: (workspaceId: string, path: string) => Promise<void>;
    listArtifacts: (workspaceId: string) => Promise<ArtifactRecord[]>;
    readArtifact: (workspaceId: string, artifactId: string) => Promise<string>;
    deleteArtifact: (artifactId: string) => Promise<void>;
    listTasks: (workspaceId: string) => Promise<TaskRecord[]>;
    saveTask: (task: TaskRecord) => Promise<TaskRecord>;
    deleteTask: (taskId: string) => Promise<void>;
    listPlans: (workspaceId: string) => Promise<PlanRecord[]>;
    savePlan: (plan: PlanRecord) => Promise<PlanRecord>;
    deletePlan: (planId: string) => Promise<void>;
    listAgentRuns: (options?: {
      workspaceId?: string;
      chatId?: string;
      limit?: number;
    }) => Promise<AgentRun[]>;
    getAgentRun: (runId: string) => Promise<AgentRunSnapshot | null>;
    loadOnboardingCompleted: () => Promise<boolean>;
    saveOnboardingCompleted: (completed: boolean) => Promise<void>;
    loadLastSeenVersion: () => Promise<string | null>;
    saveLastSeenVersion: (version: string) => Promise<void>;
    loadActiveWorkspaceId: () => Promise<string | null>;
    saveActiveWorkspaceId: (workspaceId: string) => Promise<string>;
    loadPersonalization: () => Promise<PersonalizationSettings>;
    savePersonalization: (
      settings: PersonalizationSettings
    ) => Promise<PersonalizationSettings>;
    loadAppearance: () => Promise<AppearanceSettings>;
    saveAppearance: (settings: AppearanceSettings) => Promise<AppearanceSettings>;
    loadMemories: () => Promise<MemoryEntry[]>;
    saveMemories: (memories: MemoryEntry[]) => Promise<MemoryEntry[]>;
    loadExperts: () => Promise<Expert[]>;
    saveExperts: (experts: Expert[]) => Promise<Expert[]>;
    loadSubagents: () => Promise<SubagentModel[]>;
    saveSubagents: (models: SubagentModel[]) => Promise<SubagentModel[]>;
    importLegacyData: (
      snapshot: LegacyDataSnapshot
    ) => Promise<LegacyImportResult>;
  };
  skills: {
    list: () => Promise<SkillSummary[]>;
    setEnabled: (name: string, enabled: boolean) => Promise<SkillSummary[]>;
    getBody: (name: string) => Promise<SkillDocument | null>;
    create: (skill: SkillDocument) => Promise<SkillSummary[]>;
    update: (name: string, skill: SkillDocument) => Promise<SkillSummary[]>;
    delete: (name: string) => Promise<SkillSummary[]>;
  };
  updates: {
    getVersion: () => Promise<string>;
    check: () => Promise<UpdateCheckResult>;
    openUrl: (url: string) => Promise<boolean>;
  };
  fonts: {
    list: () => Promise<string[]>;
  };
  workspaceEvents: {
    subscribe: (callback: (event: WorkspaceEvent) => void) => () => void;
  };
};
