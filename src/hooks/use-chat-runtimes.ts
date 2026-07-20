"use client";

import { Chat } from "@ai-sdk/react";
import {
  DefaultChatTransport,
  type ChatOnErrorCallback,
  type ChatOnFinishCallback,
  type ChatOnToolCallCallback,
  type ChatStatus,
  type ChatTransport,
} from "ai";
import { useCallback, useRef, useState } from "react";
import type { ChatUpdate } from "@/hooks/use-chat-history";
import type { AgentMode } from "@/lib/chat/agent-mode";
import type { ChatUIMessage } from "@/lib/chat/message";
import type { LocalChat } from "@/lib/chat/storage";
import type { ModelId } from "@/lib/models";

const PERSIST_THROTTLE_MS = 50;
let sessionTokenPromise: Promise<string> | undefined;

function getSessionToken() {
  sessionTokenPromise ??= window.desktop.auth.getSessionToken();
  return sessionTokenPromise;
}

type RuntimePersistence = {
  model: ModelId;
  providerId: string;
  agentMode: AgentMode;
};

type RuntimeCallbacks = {
  onError?: ChatOnErrorCallback;
  onFinish?: ChatOnFinishCallback<ChatUIMessage>;
  onToolCall?: ChatOnToolCallCallback<ChatUIMessage>;
  sendAutomaticallyWhen?: (options: {
    messages: ChatUIMessage[];
  }) => boolean | PromiseLike<boolean>;
};

export type ChatRuntime = {
  chat: Chat<ChatUIMessage>;
  callbacks: RuntimeCallbacks;
  persistence: RuntimePersistence;
  dispose: () => void;
};

type RuntimeOptions = {
  onMessagesChange: (
    id: string,
    messages: ChatUIMessage[],
    persistence: RuntimePersistence
  ) => void;
  onStatusChange: (id: string, status: ChatStatus) => void;
  transport?: ChatTransport<ChatUIMessage>;
};

export function createChatRuntime(
  localChat: LocalChat,
  { onMessagesChange, onStatusChange, transport }: RuntimeOptions
): ChatRuntime {
  const callbacks: RuntimeCallbacks = {};
  const persistence: RuntimePersistence = {
    model: localChat.model,
    providerId: localChat.providerId,
    agentMode: localChat.agentMode ?? "general",
  };

  const chat = new Chat<ChatUIMessage>({
    id: localChat.id,
    messages: localChat.messages as ChatUIMessage[],
    transport:
      transport ??
      new DefaultChatTransport<ChatUIMessage>({
        api: "/api/chat",
        headers: async () => ({
          Authorization: `Bearer ${await getSessionToken()}`,
        }),
      }),
    onError: (error) => callbacks.onError?.(error),
    onFinish: (event) => {
      onMessagesChange(localChat.id, event.messages, persistence);
      callbacks.onFinish?.(event);
    },
    onToolCall: (event) => callbacks.onToolCall?.(event),
    sendAutomaticallyWhen: (options) =>
      callbacks.sendAutomaticallyWhen?.(options) ?? false,
  });

  const unsubscribeMessages = chat["~registerMessagesCallback"](() => {
    onMessagesChange(localChat.id, chat.messages, persistence);
  }, PERSIST_THROTTLE_MS);
  const unsubscribeStatus = chat["~registerStatusCallback"](() => {
    onStatusChange(localChat.id, chat.status);
  });

  return {
    chat,
    callbacks,
    persistence,
    dispose: () => {
      unsubscribeMessages();
      unsubscribeStatus();
    },
  };
}

function isRunning(status: ChatStatus) {
  return status === "submitted" || status === "streaming";
}

export function useChatRuntimes(
  onChatChange: (id: string, update: ChatUpdate) => void
) {
  const runtimesRef = useRef(new Map<string, ChatRuntime>());
  const [runningChatIds, setRunningChatIds] = useState<ReadonlySet<string>>(
    () => new Set()
  );

  const handleMessagesChange = useCallback(
    (
      id: string,
      messages: ChatUIMessage[],
      persistence: RuntimePersistence
    ) => {
      onChatChange(id, { messages, ...persistence });
    },
    [onChatChange]
  );

  const handleStatusChange = useCallback((id: string, status: ChatStatus) => {
    const running = isRunning(status);
    setRunningChatIds((current) => {
      if (current.has(id) === running) return current;
      const next = new Set(current);
      if (running) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const getChatRuntime = useCallback(
    (chat: LocalChat) => {
      const existing = runtimesRef.current.get(chat.id);
      if (existing) return existing;

      const runtime = createChatRuntime(chat, {
        onMessagesChange: handleMessagesChange,
        onStatusChange: handleStatusChange,
      });
      runtimesRef.current.set(chat.id, runtime);
      return runtime;
    },
    [handleMessagesChange, handleStatusChange]
  );

  const discardChatRuntime = useCallback((id: string) => {
    const runtime = runtimesRef.current.get(id);
    if (!runtime) return;
    void runtime.chat.stop();
    runtime.dispose();
    runtimesRef.current.delete(id);
    setRunningChatIds((current) => {
      if (!current.has(id)) return current;
      const next = new Set(current);
      next.delete(id);
      return next;
    });
  }, []);

  const discardAllChatRuntimes = useCallback(() => {
    for (const runtime of runtimesRef.current.values()) {
      void runtime.chat.stop();
      runtime.dispose();
    }
    runtimesRef.current.clear();
    setRunningChatIds((current) =>
      current.size === 0 ? current : new Set()
    );
  }, []);

  return {
    runningChatIds,
    getChatRuntime,
    discardChatRuntime,
    discardAllChatRuntimes,
  };
}
