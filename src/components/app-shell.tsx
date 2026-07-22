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
import { useChatRuntimes } from "@/hooks/use-chat-runtimes";
import { useTypingChatTitles } from "@/hooks/use-typing-chat-title";
import { useModelCatalog } from "@/hooks/use-model-catalog";
import { useWorkspaces, type WorkspaceInput } from "@/hooks/use-workspaces";
import { APP_HEADER_HEIGHT } from "@/lib/branding";
import { getMessageText } from "@/lib/chat/message-text";
import type { ChatUIMessage } from "@/lib/chat/message";
import type {
  CompanionConversationPart,
  CompanionPromptRequest,
} from "@/lib/companion";
import { playCompletionDing } from "@/lib/notifications/sound";
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

function companionToolState(state: unknown, preliminary: unknown) {
  if (state === "approval-requested") return "approval" as const;
  if (state === "output-error" || state === "output-denied") {
    return "failed" as const;
  }
  if (state === "output-available" && preliminary !== true) {
    return "completed" as const;
  }
  return "running" as const;
}

function companionToolSubject(input: unknown): string | undefined {
  if (!input || typeof input !== "object") return undefined;
  const values = input as Record<string, unknown>;
  const candidate =
    values.path ??
    values.url ??
    values.query ??
    values.command ??
    values.title ??
    values.name;
  return typeof candidate === "string" && candidate.trim()
    ? candidate.trim().slice(0, 180)
    : undefined;
}

function companionMessageParts(
  message: ChatUIMessage,
  isRunningMessage: boolean
): CompanionConversationPart[] {
  const lastPartIndex = message.parts.length - 1;
  return message.parts.flatMap((part, index): CompanionConversationPart[] => {
    if (part.type === "text") {
      return part.text.trim()
        ? [{ type: "text", text: part.text.trim() }]
        : [];
    }
    if (part.type === "reasoning") {
      return [
        {
          type: "reasoning",
          text: part.text ?? "",
          state:
            isRunningMessage && index === lastPartIndex
              ? "running"
              : "completed",
        },
      ];
    }
    if (!part.type.startsWith("tool-")) return [];
    const toolPart = part as unknown as {
      state?: string;
      preliminary?: boolean;
      input?: unknown;
    };
    const subject = companionToolSubject(toolPart.input);
    return [
      {
        type: "tool",
        toolName: part.type.replace(/^tool-/, ""),
        state: companionToolState(toolPart.state, toolPart.preliminary),
        ...(subject ? { subject } : {}),
      },
    ];
  });
}

export function AppShell({ children, initialChatId }: AppShellProps) {
  const navigate = useNavigate();
  const navigateToChat = useCallback(
    (chatId: string, workspaceId: string | null) => {
      if (workspaceId) {
        void navigate({
          to: "/workspace/$workspaceId/chat/$chatId",
          params: { workspaceId, chatId },
        });
        return;
      }
      void navigate({ to: "/chat/$chatId", params: { chatId } });
    },
    [navigate]
  );
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const isSettingsRoute = pathname.startsWith("/settings");
  const isTranscriptionRoute = pathname.startsWith("/transcribe");
  const isUtilityRoute = isSettingsRoute || isTranscriptionRoute;

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

  const {
    runningChatIds,
    getChatRuntime,
    discardChatRuntime,
    discardAllChatRuntimes,
  } = useChatRuntimes(updateChat);

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

  const [credentialRefreshSignal, setCredentialRefreshSignal] = useState(0);
  const [queuedCompanionRequest, setQueuedCompanionRequest] =
    useState<CompanionPromptRequest | null>(null);
  const [companionRequest, setCompanionRequest] = useState<
    (CompanionPromptRequest & { chatId: string; workspaceId: string }) | null
  >(null);
  const [companionChatTarget, setCompanionChatTarget] = useState<{
    chatId: string;
    workspaceId: string;
  } | null>(null);
  const companionJobsRef = useRef(
    new Map<string, { requestId: string; workspaceId: string }>()
  );
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
    const unsubscribeSound =
      window.desktop.notifications.onPlayCompletionSound(() => {
        void playCompletionDing().catch(() => undefined);
      });
    const unsubscribeOpenChat = window.desktop.notifications.onOpenChat(
      ({ chatId, workspaceId }) => {
        const chat = getChatById(chatId);
        if (!chat) return;
        const targetWorkspaceId = chat.workspaceId ?? workspaceId;
        selectChat(chatId);
        if (targetWorkspaceId) setActiveWorkspaceId(targetWorkspaceId);
        if (targetWorkspaceId) {
          void navigate({
            to: "/workspace/$workspaceId/chat/$chatId",
            params: { workspaceId: targetWorkspaceId, chatId },
          });
        } else {
          void navigate({ to: "/chat/$chatId", params: { chatId } });
        }
      }
    );
    return () => {
      unsubscribeSound();
      unsubscribeOpenChat();
    };
  }, [getChatById, navigate, selectChat, setActiveWorkspaceId]);

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

  const consumeCompanionRequest = useCallback((requestId: string) => {
    setCompanionRequest((current) =>
      current?.requestId === requestId ? null : current
    );
  }, []);

  useEffect(() => {
    return window.desktop.companion.onPrompt((request) => {
      setQueuedCompanionRequest((current) => {
        if (current) {
          void window.desktop.companion.reportStatus({
            requestId: request.requestId,
            state: "failed",
            message: "درخواست قبلی هنوز در حال آماده‌سازی است.",
          });
          return current;
        }
        return request;
      });
    });
  }, []);

  useEffect(() => {
    return window.desktop.companion.onClearConversation(() => {
      setCompanionChatTarget(null);
    });
  }, []);

  useEffect(() => {
    return window.desktop.companion.onOpenChat((target) => {
      const chat = getChatById(target.chatId);
      if (!chat) return;
      selectChat(target.chatId);
      setActiveWorkspaceId(target.workspaceId);
      navigateToChat(target.chatId, target.workspaceId);
    });
  }, [getChatById, navigateToChat, selectChat, setActiveWorkspaceId]);

  useEffect(() => {
    return window.desktop.workspaceEvents.subscribe((event) => {
      if (
        event.type !== "run-changed" ||
        (event.status !== "completed" &&
          event.status !== "failed" &&
          event.status !== "cancelled")
      ) {
        return;
      }

      void window.desktop.storage
        .getAgentRun(event.runId)
        .then((snapshot) => {
          const chatId = snapshot?.run.chatId;
          if (!chatId) return;
          const job = companionJobsRef.current.get(chatId);
          if (!job) return;
          companionJobsRef.current.delete(chatId);
          void window.desktop.companion.reportStatus({
            requestId: job.requestId,
            state: event.status === "completed" ? "completed" : "failed",
            chatId,
            workspaceId: job.workspaceId,
            ...(event.status === "cancelled"
              ? { message: "اجرای ایجنت متوقف شد." }
              : snapshot.run.error
                ? { message: snapshot.run.error }
                : {}),
          });
        })
        .catch((error) => {
          console.error("Failed to resolve companion run status:", error);
        });
    });
  }, []);

  useEffect(() => {
    if (
      !queuedCompanionRequest ||
      !isHydrated ||
      !areWorkspacesHydrated ||
      !areSettingsHydrated ||
      !isCatalogHydrated ||
      companionRequest
    ) {
      return;
    }

    const request = queuedCompanionRequest;
    const existingChat = request.chatId
      ? getChatById(request.chatId)
      : null;
    const workspaceId =
      existingChat?.workspaceId ??
      (request.workspaceId &&
      workspaces.some((workspace) => workspace.id === request.workspaceId)
        ? request.workspaceId
        : activeWorkspaceId ?? HOME_WORKSPACE_ID);
    const requestedModel = resolveModel(request.model);
    const chatId =
      existingChat?.id ??
      createChat(workspaceId, {
        ...(requestedModel
          ? {
              model: {
                providerId: requestedModel.providerId,
                modelId: requestedModel.modelId,
              },
            }
          : {}),
        ...(request.agentMode ? { agentMode: request.agentMode } : {}),
      });
    setQueuedCompanionRequest(null);
    setCompanionRequest({ ...request, chatId, workspaceId });
    setCompanionChatTarget({ chatId, workspaceId });
    companionJobsRef.current.set(chatId, {
      requestId: request.requestId,
      workspaceId,
    });
    setActiveWorkspaceId(workspaceId);
    if (existingChat) selectChat(chatId);
    navigateToChat(chatId, workspaceId);
    void window.desktop.companion.reportStatus({
      requestId: request.requestId,
      state: "accepted",
      chatId,
      workspaceId,
    });
  }, [
    activeWorkspaceId,
    areSettingsHydrated,
    areWorkspacesHydrated,
    companionRequest,
    createChat,
    getChatById,
    isCatalogHydrated,
    isHydrated,
    navigateToChat,
    queuedCompanionRequest,
    resolveModel,
    selectChat,
    setActiveWorkspaceId,
    workspaces,
  ]);

  useEffect(() => {
    if (!companionChatTarget || !isHydrated) return;
    const chat = getChatById(companionChatTarget.chatId);
    if (!chat) {
      setCompanionChatTarget(null);
      return;
    }

    const isChatRunning = runningChatIds.has(chat.id);
    const lastMessage = chat.messages.at(-1);
    const messages = chat.messages.slice(-24).flatMap((message) => {
      if (message.role !== "user" && message.role !== "assistant") return [];
      const parts = companionMessageParts(
        message as ChatUIMessage,
        isChatRunning && message === lastMessage
      );
      if (parts.length === 0) return [];
      return [
        {
          id: message.id,
          role: message.role,
          parts,
        },
      ];
    });

    void window.desktop.companion.reportConversation({
      chatId: chat.id,
      workspaceId: companionChatTarget.workspaceId,
      title: chat.title,
      state: isChatRunning ? "running" : "idle",
      messages,
    });
  }, [
    companionChatTarget,
    getChatById,
    isHydrated,
    runningChatIds,
    chats,
  ]);

  const companionActivity = useMemo(() => {
    return {
      items: chats.flatMap((chat) => {
        if (!runningChatIds.has(chat.id)) return [];
        const lastUserMessage = chat.messages.findLast(
          (message) => message.role === "user"
        );
        return [
          {
            chatId: chat.id,
            workspaceId: chat.workspaceId ?? HOME_WORKSPACE_ID,
            title: chat.title,
            prompt: lastUserMessage ? getMessageText(lastUserMessage) : "",
          },
        ];
      }),
    };
  }, [chats, runningChatIds]);
  const companionActivityKey = JSON.stringify(companionActivity);

  useEffect(() => {
    void window.desktop.companion
      .reportActivity(companionActivity)
      .catch(() => undefined);
  }, [companionActivityKey]);

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
      runningChatIds,
      getChatRuntime,
      companionRequest,
      consumeCompanionRequest,
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
      runningChatIds,
      getChatRuntime,
      companionRequest,
      consumeCompanionRequest,
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

  function handleNewChat() {
    const workspaceId = activeWorkspaceId;
    setActiveWorkspaceId(workspaceId);
    const id = createChat(workspaceId);
    navigateToChat(id, workspaceId);
  }

  function handleNewWorkspaceChat(workspaceId: string) {
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
    if (id === activeChatId && !isUtilityRoute) return;
    selectChat(id);
    const chat = getChatById(id);
    const workspaceId = chat?.workspaceId ?? null;
    if (workspaceId) setActiveWorkspaceId(workspaceId);
    navigateToChat(id, workspaceId);
  }

  function handleDeleteChat(id: string) {
    if (id === activeChatId) {
      const nextChat = chats.find((chat) => chat.id !== id);
      if (nextChat) {
        navigateToChat(nextChat.id, nextChat.workspaceId ?? null);
      } else {
        void navigate({ to: "/" });
      }
    }
    discardChatRuntime(id);
    removeChat(id);
  }

  function handleDeleteAllChats() {
    discardAllChatRuntimes();
    setActiveWorkspaceId(HOME_WORKSPACE_ID);
    const id = removeAllChats();
    navigateToChat(id, HOME_WORKSPACE_ID);
  }

  function handleDeleteWorkspace(id: string) {
    if (isHomeWorkspace(id)) return;
    for (const chat of chats) {
      if (chat.workspaceId === id) discardChatRuntime(chat.id);
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
    void navigate({
      to: "/settings/models",
      search: { provider: undefined },
    });
  }

  function handleOpenTranscription() {
    void navigate({ to: "/transcribe" });
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
            runningChatIds={runningChatIds}
            workspaces={workspaces}
            activeChatId={isUtilityRoute ? null : activeChatId}
            activeWorkspaceId={activeWorkspaceId}
            settingsActive={isSettingsRoute}
            transcriptionActive={isTranscriptionRoute}
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
            onOpenTranscription={handleOpenTranscription}
            onBackToChat={handleBackToChat}
          />
        </div>
      </SidebarProvider>
    </AppShellProvider>
  );
}
