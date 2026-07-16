"use client";

import type { ChatUpdate } from "@/hooks/use-chat-history";
import type { ProjectInput } from "@/hooks/use-projects";
import type { LocalChat, LocalProject } from "@/lib/chat/storage";
import type {
  ModelCatalogSnapshot,
  ModelConfig,
  ProviderConfig,
  ProviderModelRef,
} from "@/lib/models/catalog";
import type { PersonalizationSettings } from "@/lib/settings/personalization";
import type { MemoryEntry } from "@/lib/settings/memories";
import type { Expert } from "@/lib/settings/experts";
import {
  createContext,
  useContext,
  type MutableRefObject,
  type ReactNode,
} from "react";

export type AppShellContextValue = {
  chats: LocalChat[];
  projects: LocalProject[];
  activeChat: LocalChat | null;
  activeChatId: string | null;
  isHydrated: boolean;
  areProjectsHydrated: boolean;
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
  createChat: (projectId?: string | null) => string;
  selectChat: (id: string) => void;
  updateChat: (id: string, update: ChatUpdate) => void;
  renameChat: (id: string, title: string) => void;
  lockChatTitle: (id: string) => void;
  animateRenameChat: (id: string, title: string) => void;
  typingTitles: Record<string, string>;
  setChatPinned: (id: string, pinned: boolean) => void;
  removeChat: (id: string) => void;
  removeAllChats: () => string;
  removeProjectFromChats: (projectId: string) => void;
  createProject: (input: ProjectInput) => void;
  updateProject: (id: string, input: ProjectInput) => void;
  removeProject: (id: string) => void;
  updatePersonalization: (settings: PersonalizationSettings) => void;
  handleMemoriesChange: (memories: MemoryEntry[]) => void;
  handleDeleteMemory: (id: string) => void;
  handleExpertsChange: (experts: Expert[]) => void;
  bumpCredentialRefresh: () => void;
  refreshCatalog: () => Promise<ModelCatalogSnapshot>;
  setCatalog: (catalog: ModelCatalogSnapshot) => void;
  resolveModel: (ref: ProviderModelRef | null | undefined) => ModelConfig | undefined;
  getProvider: (id: string) => ProviderConfig | undefined;
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
