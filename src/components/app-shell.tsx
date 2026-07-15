"use client";

import { AppSidebar } from "@/components/app-sidebar";
import {
  AppShellProvider,
  type AppShellContextValue,
} from "@/components/app-shell-context";
import { ChatHeader } from "@/components/chat/chat-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { useAppSettings } from "@/hooks/use-app-settings";
import { useChatHistory } from "@/hooks/use-chat-history";
import { useProjects, type ProjectInput } from "@/hooks/use-projects";
import { APP_HEADER_HEIGHT } from "@/lib/branding";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import {
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

type AppShellProps = {
  children: ReactNode;
  initialChatId?: string;
};

export function AppShell({ children, initialChatId }: AppShellProps) {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const isSettingsRoute = pathname.startsWith("/settings");

  const {
    chats,
    activeChat,
    activeChatId,
    isHydrated,
    createChat,
    selectChat,
    updateChat,
    renameChat,
    removeChat,
    removeProjectFromChats,
  } = useChatHistory(initialChatId);

  const {
    projects,
    isHydrated: areProjectsHydrated,
    createProject,
    updateProject,
    removeProject,
  } = useProjects();

  const {
    personalization,
    memories,
    isHydrated: areSettingsHydrated,
    saveState: personalizationSaveState,
    updatePersonalization,
    handleMemoriesChange,
    handleDeleteMemory,
  } = useAppSettings();

  const stopCurrentChatRef = useRef<(() => void) | null>(null);
  const [credentialRefreshSignal, setCredentialRefreshSignal] = useState(0);

  const shellValue = useMemo<AppShellContextValue>(
    () => ({
      chats,
      projects,
      activeChat,
      activeChatId,
      isHydrated,
      areProjectsHydrated,
      areSettingsHydrated,
      personalization,
      memories,
      personalizationSaveState,
      credentialRefreshSignal,
      stopCurrentChatRef,
      createChat,
      selectChat,
      updateChat,
      renameChat,
      removeChat,
      removeProjectFromChats,
      createProject,
      updateProject,
      removeProject,
      updatePersonalization,
      handleMemoriesChange,
      handleDeleteMemory,
      bumpCredentialRefresh: () =>
        setCredentialRefreshSignal((current) => current + 1),
    }),
    [
      chats,
      projects,
      activeChat,
      activeChatId,
      isHydrated,
      areProjectsHydrated,
      areSettingsHydrated,
      personalization,
      memories,
      personalizationSaveState,
      credentialRefreshSignal,
      createChat,
      selectChat,
      updateChat,
      renameChat,
      removeChat,
      removeProjectFromChats,
      createProject,
      updateProject,
      removeProject,
      updatePersonalization,
      handleMemoriesChange,
      handleDeleteMemory,
    ]
  );

  function handleNewChat() {
    stopCurrentChatRef.current?.();
    createChat();
    void navigate({ to: "/" });
  }

  function handleNewProjectChat(projectId: string) {
    stopCurrentChatRef.current?.();
    createChat(projectId);
    void navigate({ to: "/" });
  }

  function handleSelectChat(id: string) {
    if (id === activeChatId && !isSettingsRoute) return;
    stopCurrentChatRef.current?.();
    selectChat(id);
    void navigate({ to: "/chat/$chatId", params: { chatId: id } });
  }

  function handleDeleteChat(id: string) {
    if (id === activeChatId) {
      stopCurrentChatRef.current?.();
      const nextChat = chats.find((chat) => chat.id !== id);
      if (nextChat) {
        void navigate({
          to: "/chat/$chatId",
          params: { chatId: nextChat.id },
        });
      } else {
        void navigate({ to: "/" });
      }
    }
    removeChat(id);
  }

  function handleDeleteProject(id: string) {
    if (activeChat?.projectId === id) {
      stopCurrentChatRef.current?.();
    }
    removeProjectFromChats(id);
    removeProject(id);
  }

  function handleCreateProject(input: ProjectInput) {
    createProject(input);
  }

  function handleUpdateProject(id: string, input: ProjectInput) {
    updateProject(id, input);
  }

  function handleOpenSettings() {
    stopCurrentChatRef.current?.();
    void navigate({ to: "/settings" });
  }

  return (
    <AppShellProvider value={shellValue}>
      <SidebarProvider
        defaultOpen={false}
        dir="ltr"
        className="!min-h-0 h-dvh max-h-dvh flex-col overflow-hidden"
        style={{ "--app-header-height": APP_HEADER_HEIGHT } as CSSProperties}
      >
        <ChatHeader />

        <div className="flex min-h-0 flex-1 overflow-hidden">
          <SidebarInset
            dir="rtl"
            className="min-h-0 w-0 min-w-0 flex-1 overflow-hidden"
          >
            {children}
          </SidebarInset>
          <AppSidebar
            chats={chats}
            projects={projects}
            activeChatId={isSettingsRoute ? null : activeChatId}
            settingsActive={isSettingsRoute}
            onNewChat={handleNewChat}
            onNewProjectChat={handleNewProjectChat}
            onCreateProject={handleCreateProject}
            onUpdateProject={handleUpdateProject}
            onDeleteProject={handleDeleteProject}
            onSelectChat={handleSelectChat}
            onRenameChat={renameChat}
            onDeleteChat={handleDeleteChat}
            onOpenSettings={handleOpenSettings}
          />
        </div>
      </SidebarProvider>
    </AppShellProvider>
  );
}
