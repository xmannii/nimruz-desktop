"use client";

import { useAppShell } from "@/components/app-shell-context";
import { ChatView } from "@/components/chat/chat-view";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

export const Route = createFileRoute("/_app/chat/$chatId")({
  component: ChatPage,
});

function ChatPage() {
  const { chatId } = Route.useParams();
  const navigate = useNavigate();
  const { isHydrated, getChatById } = useAppShell();

  useEffect(() => {
    if (!isHydrated) return;
    const chat = getChatById(chatId);
    // Redirect to the canonical workspace-scoped URL when this chat belongs
    // to a workspace, so the workspace panel and routing stay in sync.
    if (chat?.workspaceId) {
      void navigate({
        to: "/workspace/$workspaceId/chat/$chatId",
        params: { workspaceId: chat.workspaceId, chatId },
        replace: true,
      });
    }
  }, [chatId, getChatById, isHydrated, navigate]);

  return <ChatView chatId={chatId} />;
}
