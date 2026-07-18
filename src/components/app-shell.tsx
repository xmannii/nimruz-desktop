"use client";

import { AppSidebar } from "@/components/app-sidebar";
import {
  AppShellProvider,
  type AppShellContextValue,
} from "@/components/app-shell-context";
import { ChatHeader } from "@/components/chat/chat-header";
import { OnboardingDialog } from "@/components/onboarding-dialog";
import { UpdateAvailableAlert } from "@/components/update-available-alert";
import { WhatsNewDialog } from "@/components/whats-new-dialog";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { useAppSettings } from "@/hooks/use-app-settings";
import { useAppUpdate } from "@/hooks/use-app-update";
import { useChatHistory } from "@/hooks/use-chat-history";
import { useTypingChatTitles } from "@/hooks/use-typing-chat-title";
import { useModelCatalog } from "@/hooks/use-model-catalog";
import { useWorkspaces, type WorkspaceInput } from "@/hooks/use-workspaces";
import { APP_HEADER_HEIGHT } from "@/lib/branding";
import { hasCompletedOnboarding } from "@/lib/onboarding";
import {
  seedLastSeenVersionIfNeeded,
  shouldShowWhatsNew,
} from "@/lib/whats-new";
import { HOME_WORKSPACE_ID, isHomeWorkspace } from "@/lib/workspace";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import {
  useCallback,
  useEffect,
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
    removeWorkspaceFromChats,
    setChatWorkspaceId,
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
    workspaces,
    activeWorkspace,
    activeWorkspaceId,
    workspaceRoots,
    isHydrated: areWorkspacesHydrated,
    setActiveWorkspaceId,
    createWorkspace,
    updateWorkspace,
    updateWorkspaceTrust,
    removeWorkspace,
    addLinkedRoot,
    setPrimaryRoot,
    chooseWorkingFolder,
    removeRoot,
  } = useWorkspaces();

  const {
    personalization,
    memories,
    experts,
    subagents,
    isHydrated: areSettingsHydrated,
    saveState: personalizationSaveState,
    updatePersonalization,
    handleMemoriesChange,
    handleDeleteMemory,
    handleExpertsChange,
    handleSubagentsChange,
  } = useAppSettings();

  const stopCurrentChatRef = useRef<(() => void) | null>(null);
  const [credentialRefreshSignal, setCredentialRefreshSignal] = useState(0);
  const [onboardingCompleted, setOnboardingCompleted] = useState<
    boolean | null
  >(null);
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [whatsNewOpen, setWhatsNewOpen] = useState(false);
  const [appVersion, setAppVersion] = useState<string | null>(null);
  const {
    available: availableUpdate,
    dismiss: dismissUpdate,
    openDownload: openUpdateDownload,
  } = useAppUpdate();

  useEffect(() => {
    let cancelled = false;
    void window.desktop.updates.getVersion().then((version) => {
      if (!cancelled) setAppVersion(version);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!areSettingsHydrated || !isCatalogHydrated) return;
    let cancelled = false;
    void hasCompletedOnboarding().then((completed) => {
      if (cancelled) return;
      setOnboardingCompleted(completed);
      if (!completed) setOnboardingOpen(true);
    });
    return () => {
      cancelled = true;
    };
  }, [areSettingsHydrated, isCatalogHydrated]);

  useEffect(() => {
    if (
      !areSettingsHydrated ||
      !isCatalogHydrated ||
      !appVersion ||
      onboardingCompleted === null
    ) {
      return;
    }

    let cancelled = false;

    void (async () => {
      // First install: remember the installed version so onboarding does not
      // hand off into a "what's new" dialog for v1.
      if (!onboardingCompleted) {
        await seedLastSeenVersionIfNeeded(appVersion);
        return;
      }

      if (onboardingOpen || whatsNewOpen) return;
      if (!(await shouldShowWhatsNew(appVersion))) return;
      if (cancelled) return;

      setWhatsNewOpen(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [
    areSettingsHydrated,
    isCatalogHydrated,
    appVersion,
    onboardingCompleted,
    onboardingOpen,
    whatsNewOpen,
  ]);

  const openOnboarding = useCallback(() => {
    setOnboardingOpen(true);
  }, []);

  const handleOnboardingOpenChange = useCallback((open: boolean) => {
    setOnboardingOpen(open);
    if (!open) setOnboardingCompleted(true);
  }, []);

  const shellValue = useMemo<AppShellContextValue>(
    () => ({
      chats,
      workspaces,
      activeChat,
      activeChatId,
      activeWorkspace,
      activeWorkspaceId,
      workspaceRoots,
      isHydrated,
      areWorkspacesHydrated,
      areSettingsHydrated,
      isCatalogHydrated,
      personalization,
      memories,
      experts,
      subagents,
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
      setChatWorkspaceId,
      renameChat,
      lockChatTitle,
      animateRenameChat,
      typingTitles,
      setChatPinned,
      removeChat,
      removeAllChats,
      removeWorkspaceFromChats,
      setActiveWorkspaceId,
      createWorkspace,
      updateWorkspace,
      updateWorkspaceTrust,
      removeWorkspace,
      addLinkedRoot,
      setPrimaryRoot,
      chooseWorkingFolder,
      removeRoot,
      updatePersonalization,
      handleMemoriesChange,
      handleDeleteMemory,
      handleExpertsChange,
      handleSubagentsChange,
      bumpCredentialRefresh: () =>
        setCredentialRefreshSignal((current) => current + 1),
      openOnboarding,
      refreshCatalog,
      setCatalog,
      resolveModel,
      getProvider,
      projects: workspaces,
      areProjectsHydrated: areWorkspacesHydrated,
      createProject: createWorkspace,
      updateProject: updateWorkspace,
      removeProject: removeWorkspace,
      removeProjectFromChats: removeWorkspaceFromChats,
    }),
    [
      chats,
      workspaces,
      activeChat,
      activeChatId,
      activeWorkspace,
      activeWorkspaceId,
      workspaceRoots,
      isHydrated,
      areWorkspacesHydrated,
      areSettingsHydrated,
      isCatalogHydrated,
      personalization,
      memories,
      experts,
      subagents,
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
      setChatWorkspaceId,
      renameChat,
      lockChatTitle,
      animateRenameChat,
      typingTitles,
      setChatPinned,
      removeChat,
      removeAllChats,
      removeWorkspaceFromChats,
      setActiveWorkspaceId,
      createWorkspace,
      updateWorkspace,
      updateWorkspaceTrust,
      removeWorkspace,
      addLinkedRoot,
      setPrimaryRoot,
      chooseWorkingFolder,
      removeRoot,
      updatePersonalization,
      handleMemoriesChange,
      handleDeleteMemory,
      handleExpertsChange,
      handleSubagentsChange,
      openOnboarding,
      refreshCatalog,
      setCatalog,
      resolveModel,
      getProvider,
    ]
  );

  function navigateToChat(chatId: string, workspaceId: string | null) {
    if (workspaceId) {
      void navigate({
        to: "/workspace/$workspaceId/chat/$chatId",
        params: { workspaceId, chatId },
      });
      return;
    }
    void navigate({ to: "/chat/$chatId", params: { chatId } });
  }

  function handleNewChat() {
    stopCurrentChatRef.current?.();
    const workspaceId = activeWorkspaceId;
    setActiveWorkspaceId(workspaceId);
    const id = createChat(workspaceId);
    navigateToChat(id, workspaceId);
  }

  function handleNewWorkspaceChat(workspaceId: string) {
    stopCurrentChatRef.current?.();
    setActiveWorkspaceId(workspaceId);
    const id = createChat(workspaceId);
    navigateToChat(id, workspaceId);
  }

  function handleOpenWorkspace(workspaceId: string) {
    setActiveWorkspaceId(workspaceId);
    void navigate({
      to: "/workspace/$workspaceId",
      params: { workspaceId },
    });
  }

  function handleSelectChat(id: string) {
    if (id === activeChatId && !isSettingsRoute) return;
    stopCurrentChatRef.current?.();
    selectChat(id);
    const chat = getChatById(id);
    const workspaceId = chat?.workspaceId ?? null;
    if (workspaceId) setActiveWorkspaceId(workspaceId);
    navigateToChat(id, workspaceId);
  }

  function handleDeleteChat(id: string) {
    if (id === activeChatId) {
      stopCurrentChatRef.current?.();
      const nextChat = chats.find((chat) => chat.id !== id);
      if (nextChat) {
        navigateToChat(nextChat.id, nextChat.workspaceId ?? null);
      } else {
        void navigate({ to: "/" });
      }
    }
    removeChat(id);
  }

  function handleDeleteAllChats() {
    stopCurrentChatRef.current?.();
    setActiveWorkspaceId(HOME_WORKSPACE_ID);
    const id = removeAllChats();
    navigateToChat(id, HOME_WORKSPACE_ID);
  }

  function handleDeleteWorkspace(id: string) {
    if (isHomeWorkspace(id)) return;
    if (activeChat?.workspaceId === id) {
      stopCurrentChatRef.current?.();
    }
    removeWorkspaceFromChats(id);
    removeWorkspace(id);
    if (activeWorkspaceId === id) {
      setActiveWorkspaceId(HOME_WORKSPACE_ID);
      void navigate({ to: "/" });
    }
  }

  function handleCreateWorkspace(input: WorkspaceInput) {
    const workspace = createWorkspace(input);
    void navigate({
      to: "/workspace/$workspaceId",
      params: { workspaceId: workspace.id },
    });
  }

  function handleUpdateWorkspace(id: string, input: WorkspaceInput) {
    updateWorkspace(id, input);
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
      navigateToChat(activeChatId, activeChat?.workspaceId ?? null);
      return;
    }
    void navigate({ to: "/" });
  }

  return (
    <AppShellProvider value={shellValue}>
      <SidebarProvider
        defaultOpen={true}
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

        {onboardingOpen ? (
          <OnboardingDialog
            open
            onOpenChange={handleOnboardingOpenChange}
            needsModelSetup={!hasUsableModel}
            onFinishSetup={handleOpenSettings}
          />
        ) : null}

        {whatsNewOpen && appVersion ? (
          <WhatsNewDialog
            open
            onOpenChange={setWhatsNewOpen}
            currentVersion={appVersion}
          />
        ) : null}

        <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
          <SidebarInset
            dir="rtl"
            className="min-h-0 w-0 min-w-0 max-w-full flex-1 overflow-hidden"
          >
            {children}
          </SidebarInset>
          <AppSidebar
            chats={chats}
            workspaces={workspaces}
            activeChatId={isSettingsRoute ? null : activeChatId}
            activeWorkspaceId={activeWorkspaceId}
            settingsActive={isSettingsRoute}
            memoryCount={memories.length}
            onNewChat={handleNewChat}
            onNewWorkspaceChat={handleNewWorkspaceChat}
            onOpenWorkspace={handleOpenWorkspace}
            onCreateWorkspace={handleCreateWorkspace}
            onUpdateWorkspace={handleUpdateWorkspace}
            onDeleteWorkspace={handleDeleteWorkspace}
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
