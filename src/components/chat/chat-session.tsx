"use client";

import type { ChatUpdate } from "@/hooks/use-chat-history";
import { useAppShell } from "@/components/app-shell-context";
import type { ChatUIMessage } from "@/lib/chat/message";
import type { LocalChat } from "@/lib/chat/storage";
import { DEFAULT_PROVIDER_ID, type ModelId } from "@/lib/models";
import type { ProviderModelRef } from "@/lib/models/catalog";
import {
  DEFAULT_REASONING_EFFORT,
  type ReasoningEffort,
} from "@/lib/models/reasoning";
import type { PersonalizationSettings } from "@/lib/settings/personalization";
import {
  addMemory,
  deleteMemory,
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
import { ChatMessages } from "./chat-messages";
import { getChatErrorMessage } from "@/lib/chat/errors";
import { generateChatTitle, fallbackTitleFromMessage } from "@/lib/chat/generate-chat-title";
import { toast } from "sonner";
import { getExpertValidationErrors, normalizeExpertSlug, upsertExpert, type Expert } from "@/lib/settings/experts";

const CHAT_UPDATE_THROTTLE_MS = 50;
let sessionTokenPromise: Promise<string> | undefined;

function getSessionToken() {
  sessionTokenPromise ??= window.desktop.auth.getSessionToken();
  return sessionTokenPromise;
}

type ChatSessionProps = {
  chat: LocalChat;
  onChatChange: (id: string, update: ChatUpdate) => void;
  stopRef: MutableRefObject<(() => void) | null>;
  personalization: PersonalizationSettings;
  memories: MemoryEntry[];
  experts: Expert[];
  onMemoriesChange: (memories: MemoryEntry[]) => void;
  onExpertsChange: (experts: Expert[]) => void;
};

export function ChatSession({
  chat,
  onChatChange,
  stopRef,
  personalization,
  memories,
  experts,
  onMemoriesChange,
  onExpertsChange,
}: ChatSessionProps) {
  const {
    catalog,
    enabledModelGroups,
    defaultModelRef,
    resolveModel,
    refreshCatalog,
    setCatalog,
    animateRenameChat,
    lockChatTitle,
  } = useAppShell();
  const [text, setText] = useState("");
  const [selectedExpertSlug, setSelectedExpertSlug] = useState<string | null>(
    null
  );
  const [modelRef, setModelRef] = useState<ProviderModelRef>({
    providerId: chat.providerId || DEFAULT_PROVIDER_ID,
    modelId: chat.model,
  });
  const [reasoningEffort, setReasoningEffort] =
    useState<ReasoningEffort>(DEFAULT_REASONING_EFFORT);
  const hasMounted = useRef(false);
  useEffect(() => {
    setModelRef({
      providerId: chat.providerId || DEFAULT_PROVIDER_ID,
      modelId: chat.model,
    });
  }, [chat.id, chat.model, chat.providerId]);

  useEffect(() => {
    if (!resolveModel(modelRef)) {
      const fallback =
        enabledModelGroups.flatMap((group) => group.models)[0] ?? defaultModelRef;
      if (
        fallback &&
        (fallback.providerId !== modelRef.providerId ||
          fallback.modelId !== modelRef.modelId)
      ) {
        setModelRef(fallback);
      }
    }
  }, [
    defaultModelRef,
    enabledModelGroups,
    modelRef,
    resolveModel,
  ]);

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

  const handleChatError = useCallback((chatError: Error) => {
    toast.error(getChatErrorMessage(chatError));
  }, []);

  const { messages, sendMessage, regenerate, status, stop, error, addToolOutput } =
    useChat<ChatUIMessage>({
      id: chat.id,
      messages: chat.messages as ChatUIMessage[],
      transport,
      throttle: CHAT_UPDATE_THROTTLE_MS,
      sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
      onError: handleChatError,
      onToolCall: ({ toolCall }) => {
        if (toolCall.dynamic) return;

        const requestBody = {
          providerId: modelRef.providerId,
          model: modelRef.modelId,
          reasoningEffort,
          personalization,
          memories,
          experts,
        };

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
          return;
        }

        if (toolCall.toolName === "create_expert") {
          const input = toolCall.input as Partial<Expert>;
          const validationErrors = getExpertValidationErrors(input, experts);
          if (validationErrors.length) {
            addToolOutput({
              tool: "create_expert",
              toolCallId: toolCall.toolCallId,
              output: { success: false, error: validationErrors[0] },
              options: { body: requestBody },
            });
            return;
          }
          const nextExperts = upsertExpert(experts, {
            name: input.name,
            slug: normalizeExpertSlug(input.slug || input.name),
            description: input.description,
            instructions: input.instructions,
            triggers: input.triggers,
            enabled: true,
          });
          const created = nextExperts.find((item) => item.slug === normalizeExpertSlug(input.slug || input.name));
          if (created) onExpertsChange(nextExperts);
          addToolOutput({
            tool: "create_expert",
            toolCallId: toolCall.toolCallId,
            output: {
              success: Boolean(created),
              slug: created?.slug,
              error: created ? undefined : "ذخیره متخصص ناموفق بود.",
            },
            options: { body: { ...requestBody, experts: nextExperts } },
          });
          return;
        }
      },
    });

  const getRequestBody = useCallback(
    () => ({
      providerId: modelRef.providerId,
      model: modelRef.modelId,
      reasoningEffort,
      personalization,
      memories,
      experts,
      selectedExpertSlug: selectedExpertSlug ?? undefined,
    }),
    [
      experts,
      memories,
      modelRef.modelId,
      modelRef.providerId,
      personalization,
      reasoningEffort,
      selectedExpertSlug,
    ]
  );

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

    onChatChange(chat.id, {
      messages,
      model: modelRef.modelId as ModelId,
      providerId: modelRef.providerId,
    });
  }, [chat.id, messages, modelRef, onChatChange, status]);

  const handleModelChange = useCallback(
    (next: ProviderModelRef) => {
      setModelRef(next);

      const model = resolveModel(next);
      if (!model || model.isDefault) return;

      // Remember the last picker choice as the preferred model for new chats.
      setCatalog({
        ...catalog,
        models: catalog.models.map((item) => ({
          ...item,
          isDefault: item.id === model.id,
        })),
      });

      void window.desktop.providers
        .setDefaultModel(model.id)
        .then(() => refreshCatalog())
        .catch((error) => {
          console.error("Failed to persist last selected model:", error);
          void refreshCatalog();
        });
    },
    [catalog, refreshCatalog, resolveModel, setCatalog]
  );

  const handleReasoningEffortChange = useCallback(
    (nextEffort: ReasoningEffort) => {
      setReasoningEffort(nextEffort);
    },
    []
  );

  const isBusy = status === "submitted" || status === "streaming";
  const contextMessages = isBusy
    ? (chat.messages as ChatUIMessage[])
    : messages;

  const handleRegenerate = useCallback(
    (messageId: string) => {
      if (isBusy) return;
      void regenerate({
        messageId,
        body: getRequestBody(),
      });
    },
    [getRequestBody, isBusy, regenerate]
  );

  function handleSubmit() {
    const trimmed = text.trim();
    if (!trimmed || isBusy) return;

    const isFirstMessage = messages.length === 0 && !chat.titleIsCustom;
    const chatId = chat.id;

    if (isFirstMessage) {
      lockChatTitle(chatId);
      void generateChatTitle({
        message: trimmed,
        providerId: modelRef.providerId,
        model: modelRef.modelId,
        getSessionToken,
      })
        .then((title) => {
          animateRenameChat(chatId, title);
        })
        .catch((error) => {
          console.error("Failed to generate chat title:", error);
          animateRenameChat(chatId, fallbackTitleFromMessage(trimmed));
        });
    }

    void sendMessage(
      { text: trimmed },
      {
        body: getRequestBody(),
      }
    );
    setText("");
    setSelectedExpertSlug(null);
  }

  const showCenteredComposer = messages.length === 0;

  const composer = (
    <ChatComposer
      text={text}
      onTextChange={setText}
      model={modelRef}
      onModelChange={handleModelChange}
      reasoningEffort={reasoningEffort}
      onReasoningEffortChange={handleReasoningEffortChange}
      selectedExpertSlug={selectedExpertSlug}
      onSelectedExpertChange={setSelectedExpertSlug}
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
          <ChatMessages
            messages={messages}
            status={status}
            error={error}
            isBusy={isBusy}
            onRegenerate={handleRegenerate}
          />
          <div className="mx-auto w-full max-w-3xl shrink-0 px-3 sm:px-6">
            {composer}
          </div>
        </>
      )}
    </div>
  );
}
