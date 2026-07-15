"use client";

import type { ChatUpdate } from "@/hooks/use-chat-history";
import type { ProjectInput } from "@/hooks/use-projects";
import type { LocalChat, LocalProject } from "@/lib/chat/storage";
import type { PersonalizationSettings } from "@/lib/settings/personalization";
import type { MemoryEntry } from "@/lib/settings/memories";
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
  personalization: PersonalizationSettings;
  memories: MemoryEntry[];
  personalizationSaveState: "idle" | "saving" | "saved" | "error";
  credentialRefreshSignal: number;
  stopCurrentChatRef: MutableRefObject<(() => void) | null>;
  createChat: (projectId?: string | null) => string;
  selectChat: (id: string) => void;
  updateChat: (id: string, update: ChatUpdate) => void;
  renameChat: (id: string, title: string) => void;
  removeChat: (id: string) => void;
  removeProjectFromChats: (projectId: string) => void;
  createProject: (input: ProjectInput) => void;
  updateProject: (id: string, input: ProjectInput) => void;
  removeProject: (id: string) => void;
  updatePersonalization: (settings: PersonalizationSettings) => void;
  handleMemoriesChange: (memories: MemoryEntry[]) => void;
  handleDeleteMemory: (id: string) => void;
  bumpCredentialRefresh: () => void;
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
