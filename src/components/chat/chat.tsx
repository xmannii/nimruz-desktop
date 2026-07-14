"use client";

import { AppSidebar } from "@/components/app-sidebar";
import { OpenRouterApiKeyAlert } from "@/components/openrouter-api-key-alert";
import { PersonalizationSettingsDialog } from "@/components/personalization-settings-dialog";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { useChatHistory, type ChatUpdate } from "@/hooks/use-chat-history";
import { useProjects, type ProjectInput } from "@/hooks/use-projects";
import type { ChatUIMessage } from "@/lib/chat/message";
import type { LocalChat } from "@/lib/chat/storage";
import type { ModelId } from "@/lib/models";
import { ensureLegacyMigration } from "@/lib/storage/migrate-legacy";
import {
  DEFAULT_REASONING_EFFORT,
  type ReasoningEffort,
} from "@/lib/models/reasoning";
import {
  DEFAULT_PERSONALIZATION_SETTINGS,
  loadPersonalizationSettings,
  savePersonalizationSettings,
  type PersonalizationSettings,
} from "@/lib/settings/personalization";
import {
  addMemory,
  deleteMemory,
  loadMemories,
  saveMemories,
  type MemoryEntry,
} from "@/lib/settings/memories";
import { useChat } from "@ai-sdk/react";
import {
  DefaultChatTransport,
  lastAssistantMessageIsCompleteWithToolCalls,
} from "ai";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
} from "react";
import { ChatComposer } from "./chat-composer";
import { ChatHeader } from "./chat-header";
import { ChatMessages } from "./chat-messages";

type ChatProps = {
  initialChatId?: string;
};

const CHAT_UPDATE_THROTTLE_MS = 50;
let sessionTokenPromise: Promise<string> | undefined;

function getSessionToken() {
  sessionTokenPromise ??= window.desktop.auth.getSessionToken();
  return sessionTokenPromise;
}

function pushChatUrl(id: string | null) {
  const path = id ? `/chat/${encodeURIComponent(id)}` : "/";

  if (window.location.pathname !== path) {
    window.history.pushState(null, "", path);
  }
}

export function Chat({ initialChatId }: ChatProps) {
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
  const stopCurrentChatRef = useRef<(() => void) | null>(null);
  const [personalization, setPersonalization] =
    useState<PersonalizationSettings>(
      DEFAULT_PERSONALIZATION_SETTINGS
    );
  const [memories, setMemories] = useState<MemoryEntry[]>([]);
  const [areSettingsHydrated, setAreSettingsHydrated] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsInitialTab, setSettingsInitialTab] = useState<
    "personalization" | "memories" | "connection"
  >("personalization");
  const [credentialRefreshSignal, setCredentialRefreshSignal] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void ensureLegacyMigration()
      .then(() =>
        Promise.all([loadPersonalizationSettings(), loadMemories()])
      )
      .then(([loadedPersonalization, loadedMemories]) => {
        if (cancelled) return;
        setPersonalization(loadedPersonalization);
        setMemories(loadedMemories);
      })
      .catch((error) => {
        console.error("Failed to load app settings:", error);
      })
      .finally(() => {
        if (!cancelled) setAreSettingsHydrated(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function handleNewChat() {
    stopCurrentChatRef.current?.();
    createChat();
    pushChatUrl(null);
  }

  function handleNewProjectChat(projectId: string) {
    stopCurrentChatRef.current?.();
    createChat(projectId);
    pushChatUrl(null);
  }

  function handleSelectChat(id: string) {
    if (id === activeChatId) return;
    stopCurrentChatRef.current?.();
    selectChat(id);
    pushChatUrl(id);
  }

  function handleRenameChat(id: string, title: string) {
    renameChat(id, title);
  }

  function handleDeleteChat(id: string) {
    if (id === activeChatId) {
      stopCurrentChatRef.current?.();
      const nextChat = chats.find((chat) => chat.id !== id);
      pushChatUrl(nextChat?.id ?? null);
    }
    removeChat(id);
  }

  function handleCreateProject(input: ProjectInput) {
    createProject(input);
  }

  function handleUpdateProject(id: string, input: ProjectInput) {
    updateProject(id, input);
  }

  function handleDeleteProject(id: string) {
    if (activeChat?.projectId === id) {
      stopCurrentChatRef.current?.();
    }
    removeProjectFromChats(id);
    removeProject(id);
  }

  function handleSavePersonalization(settings: PersonalizationSettings) {
    setPersonalization(settings);
    void savePersonalizationSettings(settings)
      .then(setPersonalization)
      .catch((error) => {
        console.error("Failed to save personalization:", error);
      });
  }

  function handleMemoriesChangeStable(nextMemories: MemoryEntry[]) {
    setMemories(nextMemories);
    void saveMemories(nextMemories)
      .then(setMemories)
      .catch((error) => {
        console.error("Failed to save memories:", error);
      });
  }

  function handleDeleteMemory(id: string) {
    setMemories((current) => {
      const next = deleteMemory(current, id);
      void saveMemories(next).catch((error) => {
        console.error("Failed to delete memory:", error);
      });
      return next;
    });
  }

  function openSettings(
    tab: "personalization" | "memories" | "connection" = "personalization"
  ) {
    setSettingsInitialTab(tab);
    setSettingsOpen(true);
  }

  function handleSettingsOpenChange(open: boolean) {
    setSettingsOpen(open);
    if (!open) {
      setCredentialRefreshSignal((current) => current + 1);
    }
  }

  return (
    <SidebarProvider defaultOpen={false} dir="ltr">
      <SidebarInset dir="rtl">
        <div className="flex h-dvh flex-col bg-background">
          <ChatHeader />

          <OpenRouterApiKeyAlert
            refreshSignal={credentialRefreshSignal}
            onConfigure={() => openSettings("connection")}
          />

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            {isHydrated &&
            areProjectsHydrated &&
            areSettingsHydrated &&
            activeChat ? (
              <ChatSession
                key={activeChat.id}
                chat={activeChat}
                onChatChange={updateChat}
                onChatStarted={(id) => pushChatUrl(id)}
                stopRef={stopCurrentChatRef}
                personalization={personalization}
                memories={memories}
                onMemoriesChange={handleMemoriesChangeStable}
              />
            ) : (
              <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
                در حال بارگذاری گفتگوها…
              </div>
            )}
          </div>
        </div>
      </SidebarInset>
      <AppSidebar
        chats={chats}
        projects={projects}
        activeChatId={activeChatId}
        onNewChat={handleNewChat}
        onNewProjectChat={handleNewProjectChat}
        onCreateProject={handleCreateProject}
        onUpdateProject={handleUpdateProject}
        onDeleteProject={handleDeleteProject}
        onSelectChat={handleSelectChat}
        onRenameChat={handleRenameChat}
        onDeleteChat={handleDeleteChat}
        onOpenSettings={() => openSettings()}
      />
      {settingsOpen ? (
        <PersonalizationSettingsDialog
          open
          onOpenChange={handleSettingsOpenChange}
          settings={personalization}
          onSave={handleSavePersonalization}
          memories={memories}
          onDeleteMemory={handleDeleteMemory}
          initialTab={settingsInitialTab}
          onCredentialsChange={() =>
            setCredentialRefreshSignal((current) => current + 1)
          }
        />
      ) : null}
    </SidebarProvider>
  );
}

type ChatSessionProps = {
  chat: LocalChat;
  onChatChange: (id: string, update: ChatUpdate) => void;
  onChatStarted: (id: string) => void;
  stopRef: MutableRefObject<(() => void) | null>;
  personalization: PersonalizationSettings;
  memories: MemoryEntry[];
  onMemoriesChange: (memories: MemoryEntry[]) => void;
};

function ChatSession({
  chat,
  onChatChange,
  onChatStarted,
  stopRef,
  personalization,
  memories,
  onMemoriesChange,
}: ChatSessionProps) {
  const [text, setText] = useState("");
  const [model, setModel] = useState<ModelId>(chat.model);
  const [reasoningEffort, setReasoningEffort] =
    useState<ReasoningEffort>(DEFAULT_REASONING_EFFORT);
  const hasMounted = useRef(false);
  const transport = useMemo(
    () =>
      new DefaultChatTransport<ChatUIMessage>({
        api: "/api/chat",
        headers: async () => ({
          Authorization: `Bearer ${await getSessionToken()}`,
        }),
      }),
    []
  );

  const { messages, sendMessage, status, stop, error, addToolOutput } =
    useChat<ChatUIMessage>({
      id: chat.id,
      messages: chat.messages as ChatUIMessage[],
      transport,
      throttle: CHAT_UPDATE_THROTTLE_MS,
      sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
      onToolCall: ({ toolCall }) => {
        if (toolCall.dynamic) return;

        const requestBody = { model, reasoningEffort, personalization, memories };

        if (toolCall.toolName === "save_memory") {
          const input = toolCall.input as {
            content?: string;
            category?: MemoryEntry["category"];
          };
          const result = addMemory(memories, {
            content: input.content ?? "",
            category: input.category,
          });
          const nextMemories = result.entry ? result.memories : memories;

          if (result.entry) {
            onMemoriesChange(nextMemories);
          }

          addToolOutput({
            tool: "save_memory",
            toolCallId: toolCall.toolCallId,
            output: {
              success: Boolean(result.entry),
              id: result.entry?.id,
              error: result.error ?? undefined,
            },
            options: {
              body: {
                ...requestBody,
                memories: nextMemories,
              },
            },
          });
          return;
        }

        if (toolCall.toolName === "delete_memory") {
          const input = toolCall.input as { id?: string };
          const id = input.id ?? "";
          const nextMemories = deleteMemory(memories, id);

          if (nextMemories.length !== memories.length) {
            onMemoriesChange(nextMemories);
          }

          addToolOutput({
            tool: "delete_memory",
            toolCallId: toolCall.toolCallId,
            output: {
              success: true,
              deleted: nextMemories.length !== memories.length,
            },
            options: {
              body: {
                ...requestBody,
                memories: nextMemories,
              },
            },
          });
        }
      },
    });

  useEffect(() => {
    stopRef.current = stop;

    return () => {
      if (stopRef.current === stop) {
        stopRef.current = null;
      }
    };
  }, [stop, stopRef]);

  useEffect(() => {
    if (!hasMounted.current) {
      hasMounted.current = true;
      return;
    }

    if (status === "submitted" || status === "streaming") return;

    onChatChange(chat.id, { messages, model });
  }, [chat.id, messages, model, onChatChange, status]);

  const handleModelChange = useCallback((nextModel: ModelId) => {
    setModel(nextModel);
  }, []);

  const handleReasoningEffortChange = useCallback((nextEffort: ReasoningEffort) => {
    setReasoningEffort(nextEffort);
  }, []);

  const isBusy = status === "submitted" || status === "streaming";
  const contextMessages = isBusy
    ? (chat.messages as ChatUIMessage[])
    : messages;

  function handleSubmit() {
    const trimmed = text.trim();
    if (!trimmed || isBusy) return;

    if (chat.messages.length === 0) {
      onChatStarted(chat.id);
    }

    void sendMessage(
      { text: trimmed },
      {
        body: { model, reasoningEffort, personalization, memories },
      }
    );
    setText("");
  }

  const showCenteredComposer = messages.length === 0;

  const composer = (
    <ChatComposer
      text={text}
      onTextChange={setText}
      model={model}
      onModelChange={handleModelChange}
      reasoningEffort={reasoningEffort}
      onReasoningEffortChange={handleReasoningEffortChange}
      status={status}
      onSubmit={handleSubmit}
      onStop={stop}
      centered={showCenteredComposer}
      messages={contextMessages}
    />
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {showCenteredComposer ? (
        <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-3 sm:px-6">
          <div className="flex flex-1 items-center justify-center">
            <div className="w-full">
              <p
                dir="rtl"
                className="mb-4 text-right text-xl font-medium tracking-tight text-foreground sm:text-2xl"
              >
                از کجا شروع کنیم؟ ✨
              </p>
              {composer}
            </div>
          </div>
        </div>
      ) : (
        <>
          <ChatMessages messages={messages} status={status} error={error} />
          <div className="mx-auto w-full max-w-3xl shrink-0 px-3 sm:px-6">
            {composer}
          </div>
        </>
      )}
    </div>
  );
}
