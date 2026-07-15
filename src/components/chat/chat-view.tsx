"use client";

import { useAppShell } from "@/components/app-shell-context";
import { OpenRouterApiKeyAlert } from "@/components/openrouter-api-key-alert";
import { ChatSession } from "@/components/chat/chat-session";
import { useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

type ChatViewProps = {
  chatId?: string;
};

export function ChatView({ chatId }: ChatViewProps) {
  const navigate = useNavigate();
  const {
    activeChat,
    activeChatId,
    isHydrated,
    areProjectsHydrated,
    areSettingsHydrated,
    personalization,
    memories,
    credentialRefreshSignal,
    stopCurrentChatRef,
    selectChat,
    updateChat,
    handleMemoriesChange,
  } = useAppShell();

  useEffect(() => {
    if (!chatId || !isHydrated) return;
    if (chatId !== activeChatId) {
      selectChat(chatId);
    }
  }, [activeChatId, chatId, isHydrated, selectChat]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <OpenRouterApiKeyAlert
        refreshSignal={credentialRefreshSignal}
        onConfigure={() => {
          void navigate({ to: "/settings/connection" });
        }}
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
            onChatStarted={(id) => {
              void navigate({
                to: "/chat/$chatId",
                params: { chatId: id },
              });
            }}
            stopRef={stopCurrentChatRef}
            personalization={personalization}
            memories={memories}
            onMemoriesChange={handleMemoriesChange}
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
