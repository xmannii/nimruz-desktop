"use client";

import { useAppShell } from "@/components/app-shell-context";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

export const Route = createFileRoute("/_app/")({
  component: HomeChatPage,
});

function HomeChatPage() {
  const navigate = useNavigate();
  const { activeChatId, isHydrated } = useAppShell();

  useEffect(() => {
    if (!isHydrated || !activeChatId) return;
    void navigate({
      to: "/chat/$chatId",
      params: { chatId: activeChatId },
      replace: true,
    });
  }, [activeChatId, isHydrated, navigate]);

  return (
    <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
      در حال بارگذاری گفتگو…
    </div>
  );
}
