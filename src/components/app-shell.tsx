"use client";

import { AppSidebar } from "@/components/app-sidebar";
import {
  AppShellProvider,
  type AppShellContextValue,
} from "@/components/app-shell-context";
import { ChatHeader } from "@/components/chat/chat-header";
import { UpdateAvailableAlert } from "@/components/update-available-alert";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { useAppSettings } from "@/hooks/use-app-settings";
import { useAppUpdate } from "@/hooks/use-app-update";
import { useChatHistory } from "@/hooks/use-chat-history";
import { useTypingChatTitles } from "@/hooks/use-typing-chat-title";
import { useModelCatalog } from "@/hooks/use-model-catalog";
import { useProjects, type ProjectInput } from "@/hooks/use-projects";
import { APP_HEADER_HEIGHT } from "@/lib/branding";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import {
  useCallback,
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
    providers,
    models,
    catalog,
    isHydrated: isCatalogHydrated,
    defaultRef,
    enabledGroups,
    hasUsableModel,
    resolveModel,
    getProvider,
    refresh: refreshCatalog,
    setCatalog,
  } = useModelCatalog();

  const {
    chats,
    activeChat,
    activeChatId,
    isHydrated,
    getChatById,
    createChat,
    selectChat,
    updateChat,
    renameChat,
    lockChatTitle,
    setChatPinned,
    removeChat,
    removeAllChats,
    removeProjectFromChats,
  } = useChatHistory(initialChatId, defaultRef);

  const { typingTitles, animateChatTitle } = useTypingChatTitles();

  const animateRenameChat = useCallback(
    (chatId: string, title: string) => {
      animateChatTitle(chatId, title, (finalTitle) => {
        renameChat(chatId, finalTitle);
      });
    },
    [animateChatTitle, renameChat]
  );

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
    experts,
    isHydrated: areSettingsHydrated,
    saveState: personalizationSaveState,
    updatePersonalization,
    handleMemoriesChange,
    handleDeleteMemory,
    handleExpertsChange,
  } = useAppSettings();

  const stopCurrentChatRef = useRef<(() => void) | null>(null);
  const [credentialRefreshSignal, setCredentialRefreshSignal] = useState(0);
  const {
    available: availableUpdate,
    dismiss: dismissUpdate,
    openDownload: openUpdateDownload,
  } = useAppUpdate();

  const shellValue = useMemo<AppShellContextValue>(
    () => ({
      chats,
      projects,
      activeChat,
      activeChatId,
      isHydrated,
      areProjectsHydrated,
      areSettingsHydrated,
      isCatalogHydrated,
      personalization,
      memories,
      experts,
      personalizationSaveState,
      credentialRefreshSignal,
      providers,
      models,
      catalog,
      defaultModelRef: defaultRef,
      enabledModelGroups: enabledGroups,
      hasUsableModel,
      stopCurrentChatRef,
      getChatById,
      createChat,
      selectChat,
      updateChat,
      renameChat,
      lockChatTitle,
      animateRenameChat,
      typingTitles,
      setChatPinned,
      removeChat,
      removeAllChats,
      removeProjectFromChats,
      createProject,
      updateProject,
      removeProject,
      updatePersonalization,
      handleMemoriesChange,
      handleDeleteMemory,
      handleExpertsChange,
      bumpCredentialRefresh: () =>
        setCredentialRefreshSignal((current) => current + 1),
      refreshCatalog,
      setCatalog,
      resolveModel,
      getProvider,
    }),
    [
      chats,
      projects,
      activeChat,
      activeChatId,
      isHydrated,
      areProjectsHydrated,
      areSettingsHydrated,
      isCatalogHydrated,
      personalization,
      memories,
      experts,
      personalizationSaveState,
      credentialRefreshSignal,
      providers,
      models,
      catalog,
      defaultRef,
      enabledGroups,
      hasUsableModel,
      getChatById,
      createChat,
      selectChat,
      updateChat,
      renameChat,
      lockChatTitle,
      animateRenameChat,
      typingTitles,
      setChatPinned,
      removeChat,
      removeAllChats,
      removeProjectFromChats,
      createProject,
      updateProject,
      removeProject,
      updatePersonalization,
      handleMemoriesChange,
      handleDeleteMemory,
      handleExpertsChange,
      refreshCatalog,
      setCatalog,
      resolveModel,
      getProvider,
    ]
  );

  function handleNewChat() {
    stopCurrentChatRef.current?.();
    const id = createChat();
    void navigate({ to: "/chat/$chatId", params: { chatId: id } });
  }

  function handleNewProjectChat(projectId: string) {
    stopCurrentChatRef.current?.();
    const id = createChat(projectId);
    void navigate({ to: "/chat/$chatId", params: { chatId: id } });
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

  function handleDeleteAllChats() {
    stopCurrentChatRef.current?.();
    const id = removeAllChats();
    void navigate({ to: "/chat/$chatId", params: { chatId: id } });
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
    void navigate({
      to: "/settings/models",
      search: { provider: undefined },
    });
  }

  function handleBackToChat() {
    if (activeChatId) {
      void navigate({
        to: "/chat/$chatId",
        params: { chatId: activeChatId },
      });
      return;
    }
    void navigate({ to: "/" });
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

        {availableUpdate ? (
          <UpdateAvailableAlert
            update={availableUpdate}
            onDownload={() => void openUpdateDownload()}
            onDismiss={dismissUpdate}
          />
        ) : null}

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
            memoryCount={memories.length}
            onNewChat={handleNewChat}
            onNewProjectChat={handleNewProjectChat}
            onCreateProject={handleCreateProject}
            onUpdateProject={handleUpdateProject}
            onDeleteProject={handleDeleteProject}
            onSelectChat={handleSelectChat}
            onRenameChat={renameChat}
            onDeleteChat={handleDeleteChat}
            onDeleteAllChats={handleDeleteAllChats}
            onPinChat={setChatPinned}
            typingTitles={typingTitles}
            onOpenSettings={handleOpenSettings}
            onBackToChat={handleBackToChat}
          />
        </div>
      </SidebarProvider>
    </AppShellProvider>
  );
}
