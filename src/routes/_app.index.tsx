"use client";

import { useAppShell } from "@/components/app-shell-context";
import { HOME_WORKSPACE_ID } from "@/lib/workspace";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

export const Route = createFileRoute("/_app/")({
  component: HomeChatPage,
});

function HomeChatPage() {
  const navigate = useNavigate();
  const { activeChatId, activeChat, isHydrated } = useAppShell();

  useEffect(() => {
    if (!isHydrated || !activeChatId) return;

    const workspaceId = activeChat?.workspaceId ?? HOME_WORKSPACE_ID;
    void navigate({
      to: "/workspace/$workspaceId/chat/$chatId",
      params: { workspaceId, chatId: activeChatId },
      replace: true,
    });
  }, [activeChat, activeChatId, isHydrated, navigate]);

  return (
    <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
      در حال بارگذاری گفتگو…
    </div>
  );
}
