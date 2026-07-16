"use client";

import type { ChatUpdate } from "@/hooks/use-chat-history";
import type { WorkspaceInput } from "@/hooks/use-workspaces";
import type { LocalChat, LocalWorkspace } from "@/lib/chat/storage";
import type {
  ModelCatalogSnapshot,
  ModelConfig,
  ProviderConfig,
  ProviderModelRef,
} from "@/lib/models/catalog";
import type { PersonalizationSettings } from "@/lib/settings/personalization";
import type { MemoryEntry } from "@/lib/settings/memories";
import type { Expert } from "@/lib/settings/experts";
import type { WorkspaceRoot, WorkspaceTrustSettings } from "@/lib/workspace";
import {
  createContext,
  useContext,
  type MutableRefObject,
  type ReactNode,
} from "react";

export type AppShellContextValue = {
  chats: LocalChat[];
  workspaces: LocalWorkspace[];
  activeChat: LocalChat | null;
  activeChatId: string | null;
  activeWorkspace: LocalWorkspace | null;
  activeWorkspaceId: string | null;
  workspaceRoots: WorkspaceRoot[];
  isHydrated: boolean;
  areWorkspacesHydrated: boolean;
  areSettingsHydrated: boolean;
  isCatalogHydrated: boolean;
  personalization: PersonalizationSettings;
  memories: MemoryEntry[];
  experts: Expert[];
  personalizationSaveState: "idle" | "saving" | "saved" | "error";
  credentialRefreshSignal: number;
  providers: ProviderConfig[];
  models: ModelConfig[];
  catalog: ModelCatalogSnapshot;
  defaultModelRef: ProviderModelRef | null;
  enabledModelGroups: Array<{
    provider: ProviderConfig;
    models: ModelConfig[];
  }>;
  hasUsableModel: boolean;
  stopCurrentChatRef: MutableRefObject<(() => void) | null>;
  getChatById: (id: string) => LocalChat | null;
  createChat: (workspaceId?: string | null) => string;
  selectChat: (id: string) => void;
  updateChat: (id: string, update: ChatUpdate) => void;
  setChatWorkspaceId: (chatId: string, workspaceId: string) => void;
  renameChat: (id: string, title: string) => void;
  lockChatTitle: (id: string) => void;
  animateRenameChat: (id: string, title: string) => void;
  typingTitles: Record<string, string>;
  setChatPinned: (id: string, pinned: boolean) => void;
  removeChat: (id: string) => void;
  removeAllChats: () => string;
  removeWorkspaceFromChats: (workspaceId: string) => void;
  setActiveWorkspaceId: (id: string | null) => void;
  createWorkspace: (input: WorkspaceInput) => LocalWorkspace;
  updateWorkspace: (id: string, input: WorkspaceInput) => void;
  updateWorkspaceTrust: (
    id: string,
    trust: WorkspaceTrustSettings
  ) => Promise<LocalWorkspace>;
  removeWorkspace: (id: string) => void;
  addLinkedRoot: (
    workspaceId: string,
    options?: { path?: string; makePrimary?: boolean }
  ) => Promise<WorkspaceRoot | null>;
  setPrimaryRoot: (
    workspaceId: string,
    rootId: string
  ) => Promise<WorkspaceRoot[]>;
  chooseWorkingFolder: () => Promise<string | null>;
  removeRoot: (rootId: string) => Promise<void>;
  updatePersonalization: (settings: PersonalizationSettings) => void;
  handleMemoriesChange: (memories: MemoryEntry[]) => void;
  handleDeleteMemory: (id: string) => void;
  handleExpertsChange: (experts: Expert[]) => void;
  bumpCredentialRefresh: () => void;
  openOnboarding: () => void;
  refreshCatalog: () => Promise<ModelCatalogSnapshot>;
  setCatalog: (catalog: ModelCatalogSnapshot) => void;
  resolveModel: (ref: ProviderModelRef | null | undefined) => ModelConfig | undefined;
  getProvider: (id: string) => ProviderConfig | undefined;
  /** @deprecated Use workspaces */
  projects: LocalWorkspace[];
  /** @deprecated Use areWorkspacesHydrated */
  areProjectsHydrated: boolean;
  /** @deprecated Use createWorkspace */
  createProject: (input: WorkspaceInput) => LocalWorkspace;
  /** @deprecated Use updateWorkspace */
  updateProject: (id: string, input: WorkspaceInput) => void;
  /** @deprecated Use removeWorkspace */
  removeProject: (id: string) => void;
  /** @deprecated Use removeWorkspaceFromChats */
  removeProjectFromChats: (projectId: string) => void;
};

const AppShellContext = createContext<AppShellContextValue | null>(null);

export function AppShellProvider({
  value,
  children,
}: {
  value: AppShellContextValue;
  children: ReactNode;
}) {
  return (
    <AppShellContext.Provider value={value}>{children}</AppShellContext.Provider>
  );
}

export function useAppShell() {
  const value = useContext(AppShellContext);
  if (!value) {
    throw new Error("useAppShell must be used within AppShellProvider");
  }
  return value;
}
