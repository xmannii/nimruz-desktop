import type { LocalChat, LocalProject } from "@/lib/chat/storage";
import type { MemoryEntry } from "@/lib/settings/memories";
import type { PersonalizationSettings } from "@/lib/settings/personalization";

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
    getStatus: () => Promise<CredentialStatus>;
    setOpenRouterKey: (key: string) => Promise<CredentialStatus>;
    clearOpenRouterKey: () => Promise<CredentialStatus>;
    testOpenRouterKey: (key?: string) => Promise<CredentialTestResult>;
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
    importLegacyData: (
      snapshot: LegacyDataSnapshot
    ) => Promise<LegacyImportResult>;
  };
};
