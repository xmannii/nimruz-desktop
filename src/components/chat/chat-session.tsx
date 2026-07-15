"use client";

import type { ChatUpdate } from "@/hooks/use-chat-history";
import type { ChatUIMessage } from "@/lib/chat/message";
import type { LocalChat } from "@/lib/chat/storage";
import type { ModelId } from "@/lib/models";
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

const CHAT_UPDATE_THROTTLE_MS = 50;
let sessionTokenPromise: Promise<string> | undefined;

function getSessionToken() {
  sessionTokenPromise ??= window.desktop.auth.getSessionToken();
  return sessionTokenPromise;
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

export function ChatSession({
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
