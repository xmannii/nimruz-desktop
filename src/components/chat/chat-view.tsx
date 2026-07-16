"use client";

import { useAppShell } from "@/components/app-shell-context";
import { OpenRouterApiKeyAlert } from "@/components/openrouter-api-key-alert";
import { ChatSession } from "@/components/chat/chat-session";
import { useEffect, useMemo } from "react";

type ChatViewProps = {
  chatId?: string;
};

export function ChatView({ chatId }: ChatViewProps) {
  const {
    activeChat,
    activeChatId,
    isHydrated,
    areProjectsHydrated,
    areSettingsHydrated,
    personalization,
    memories,
    experts,
    credentialRefreshSignal,
    stopCurrentChatRef,
    getChatById,
    selectChat,
    updateChat,
    handleMemoriesChange,
    handleExpertsChange,
  } = useAppShell();

  const resolvedChat = useMemo(() => {
    if (!chatId) return activeChat;
    // State moved ahead of the URL (createChat before navigate finishes).
    if (activeChatId && chatId !== activeChatId && activeChat) {
      return activeChat;
    }
    if (activeChat?.id === chatId) return activeChat;
    return getChatById(chatId);
  }, [activeChat, activeChatId, chatId, getChatById]);

  useEffect(() => {
    if (!chatId || !isHydrated) return;
    if (chatId === activeChatId) return;
    if (getChatById(chatId)) {
      selectChat(chatId);
    }
    // Only react to URL changes (browser back/forward). Do not depend on
    // activeChatId — createChat updates state before navigate, and syncing
    // back to the stale URL chat undoes the new draft.
  }, [chatId, isHydrated]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      {resolvedChat ? (
        <OpenRouterApiKeyAlert
          refreshSignal={credentialRefreshSignal}
          providerId={resolvedChat.providerId}
        />
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {isHydrated &&
        areProjectsHydrated &&
        areSettingsHydrated &&
        resolvedChat ? (
          <ChatSession
            key={resolvedChat.id}
            chat={resolvedChat}
            onChatChange={updateChat}
            stopRef={stopCurrentChatRef}
            personalization={personalization}
            memories={memories}
            experts={experts}
            onMemoriesChange={handleMemoriesChange}
            onExpertsChange={handleExpertsChange}
          />
        ) : (
          <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
            در حال بارگذاری گفتگوها…
          </div>
        )}
      </div>
    </div>
  );
}
