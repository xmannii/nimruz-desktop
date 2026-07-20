"use client";

import { ChatSidebarTitle } from "@/components/chat/chat-sidebar-title";
import { SidebarChatMenu, sidebarRowMenuTriggerClassName } from "@/components/chat/sidebar/sidebar-chat-menu";
import { SidebarMenuItem } from "@/components/ui/sidebar";
import type { LocalChat } from "@/lib/chat/storage";
import { cn } from "@/lib/utils";
import { LoaderCircleIcon } from "lucide-react";

const PROJECT_CHAT_TEXT_INDENT = "ps-8";

type SidebarChatRowProps = {
  chat: LocalChat;
  isRunning?: boolean;
  activeChatId: string | null;
  typingTitles: Record<string, string>;
  workspaceLabel?: string;
  indented?: boolean;
  onSelect: (id: string) => void;
  onRename: (chat: LocalChat) => void;
  onDelete: (chat: LocalChat) => void;
  onPin: (chat: LocalChat, pinned: boolean) => void;
};

export function SidebarChatRow({
  chat,
  isRunning = false,
  activeChatId,
  typingTitles,
  workspaceLabel,
  indented = false,
  onSelect,
  onRename,
  onDelete,
  onPin,
}: SidebarChatRowProps) {
  const isActive = chat.id === activeChatId;

  return (
    <SidebarMenuItem>
      <div
        data-active={isActive || undefined}
        className={cn(
          "group/row flex h-8 w-full min-w-0 items-center rounded-md transition-colors hover:bg-sidebar-accent/80",
          isActive && "bg-sidebar-accent text-sidebar-accent-foreground"
        )}
      >
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center px-2.5 text-start text-[13px] font-normal"
          onClick={() => onSelect(chat.id)}
        >
          {isRunning ? (
            <LoaderCircleIcon
              aria-label="پاسخ در حال دریافت است"
              className="me-1.5 size-3.5 shrink-0 animate-spin text-primary"
            />
          ) : null}
          <span
            className={cn(
              "flex min-w-0 flex-1 flex-col items-start gap-0",
              indented && PROJECT_CHAT_TEXT_INDENT
            )}
          >
            <ChatSidebarTitle
              title={chat.title}
              typingTitle={typingTitles[chat.id]}
              className="w-full"
            />
            {workspaceLabel ? (
              <span className="w-full truncate text-[10px] text-muted-foreground/70">
                {workspaceLabel}
              </span>
            ) : null}
          </span>
        </button>

        <SidebarChatMenu
          chat={chat}
          onRename={onRename}
          onDelete={onDelete}
          onPin={onPin}
          className="me-1 shrink-0"
          triggerClassName={sidebarRowMenuTriggerClassName}
        />
      </div>
    </SidebarMenuItem>
  );
}
