import type { LocalChat, LocalProject } from "@/lib/chat/storage";
import type {
  ModelCatalogSnapshot,
  ModelConfig,
  ModelDiscoveryResult,
  ProviderConfig,
  ProviderTestResult,
} from "@/lib/models/catalog";
import type { MemoryEntry } from "@/lib/settings/memories";
import type { PersonalizationSettings } from "@/lib/settings/personalization";
import type { SkillDocument, SkillSummary } from "@/lib/skills/types";
import type { UpdateCheckResult } from "@/lib/updates";
import type { Expert } from "@/lib/settings/experts";

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
    loadProjects: () => Promise<LocalProject[]>;
    saveProject: (project: LocalProject) => Promise<void>;
    deleteProject: (id: string) => Promise<void>;
    loadPersonalization: () => Promise<PersonalizationSettings>;
    savePersonalization: (
      settings: PersonalizationSettings
    ) => Promise<PersonalizationSettings>;
    loadMemories: () => Promise<MemoryEntry[]>;
    saveMemories: (memories: MemoryEntry[]) => Promise<MemoryEntry[]>;
    loadExperts: () => Promise<Expert[]>;
    saveExperts: (experts: Expert[]) => Promise<Expert[]>;
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
};
