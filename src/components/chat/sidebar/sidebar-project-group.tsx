"use client";

import { SidebarChatRow } from "@/components/chat/sidebar/sidebar-chat-row";
import { sidebarProjectNewChatClassName, sidebarRowMenuTriggerClassName } from "@/components/chat/sidebar/sidebar-chat-menu";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import type { LocalChat, LocalWorkspace } from "@/lib/chat/storage";
import { HOME_WORKSPACE_ID, isHomeWorkspace } from "@/lib/workspace";
import { cn } from "@/lib/utils";
import {
  ChevronDownIcon,
  FolderIcon,
  FolderOpenIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react";
import { useEffect, useState } from "react";

function SidebarProjectIcon({ open }: { open: boolean }) {
  const iconClass =
    "absolute inset-0 m-auto size-3.5 transition-all duration-200 ease-out";

  return (
    <span className="relative block size-3.5">
      <FolderIcon
        aria-hidden
        className={cn(
          iconClass,
          open
            ? "scale-75 opacity-0"
            : "scale-100 opacity-100 group-hover/project:scale-75 group-hover/project:opacity-0"
        )}
      />
      <ChevronDownIcon
        aria-hidden
        className={cn(
          iconClass,
          open
            ? "scale-75 opacity-0"
            : "scale-75 opacity-0 group-hover/project:scale-100 group-hover/project:opacity-100"
        )}
      />
      <FolderOpenIcon
        aria-hidden
        className={cn(
          iconClass,
          open ? "scale-100 opacity-100" : "scale-75 opacity-0"
        )}
      />
    </span>
  );
}

type SidebarProjectGroupProps = {
  workspace: LocalWorkspace;
  chats: LocalChat[];
  runningChatIds: ReadonlySet<string>;
  activeChatId: string | null;
  activeWorkspaceId?: string | null;
  typingTitles: Record<string, string>;
  defaultOpen?: boolean;
  onSelectChat: (id: string) => void;
  onNewChat: (workspaceId: string) => void;
  onOpenWorkspace: (workspaceId: string) => void;
  onEditWorkspace: (workspace: LocalWorkspace) => void;
  onDeleteWorkspace: (workspace: LocalWorkspace) => void;
  onRenameChat: (chat: LocalChat) => void;
  onDeleteChat: (chat: LocalChat) => void;
  onPinChat: (chat: LocalChat, pinned: boolean) => void;
};

export function SidebarProjectGroup({
  workspace,
  chats,
  runningChatIds,
  activeChatId,
  activeWorkspaceId = null,
  typingTitles,
  defaultOpen = false,
  onSelectChat,
  onNewChat,
  onOpenWorkspace,
  onEditWorkspace,
  onDeleteWorkspace,
  onRenameChat,
  onDeleteChat,
  onPinChat,
}: SidebarProjectGroupProps) {
  const home = isHomeWorkspace(workspace);
  const hasActiveChat = chats.some((chat) => chat.id === activeChatId);
  const normalizedActiveWorkspaceId = activeWorkspaceId ?? HOME_WORKSPACE_ID;
  const isWorkspaceActive = workspace.id === normalizedActiveWorkspaceId;
  const isProjectHighlighted = isWorkspaceActive && !hasActiveChat;
  const [open, setOpen] = useState(defaultOpen || hasActiveChat || isWorkspaceActive);

  useEffect(() => {
    if (hasActiveChat || isWorkspaceActive) {
      setOpen(true);
    }
  }, [hasActiveChat, isWorkspaceActive, workspace.id]);

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      render={<SidebarMenuItem />}
    >
      <div className="group/project-block w-full">
        <div
          data-active={isProjectHighlighted || undefined}
          className={cn(
            "group/row flex w-full min-w-0 items-center rounded-lg hover:bg-sidebar-accent/50",
            isProjectHighlighted &&
              "bg-sidebar-accent/70 ring-1 ring-sidebar-primary/25"
          )}
        >
          <CollapsibleTrigger
            render={
              <SidebarMenuButton
                title={workspace.description || undefined}
                isActive={isProjectHighlighted}
                className="group/project h-9 min-w-0 flex-1 gap-2.5 text-[13px] hover:bg-transparent active:bg-transparent data-active:bg-transparent"
              />
            }
          >
            <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
              <SidebarProjectIcon open={open} />
            </span>
            <span className="min-w-0 flex-1 truncate text-start font-medium">
              {workspace.title}
            </span>
            {chats.length > 0 ? (
              <Badge
                variant="secondary"
                className="h-4 min-w-4 px-1 text-[10px] tabular-nums"
              >
                {chats.length}
              </Badge>
            ) : null}
          </CollapsibleTrigger>

          <button
            type="button"
            className={cn(sidebarProjectNewChatClassName, "me-0.5 shrink-0")}
            aria-label={`گفتگوی جدید در ${workspace.title}`}
            title="گفتگوی جدید"
            onClick={(event) => {
              event.stopPropagation();
              onNewChat(workspace.id);
            }}
          >
            <PlusIcon className="size-3.5" />
          </button>

          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <button
                  type="button"
                  className={cn(sidebarRowMenuTriggerClassName, "me-1 shrink-0")}
                  aria-label={`گزینه‌های ${workspace.title}`}
                  title="گزینه‌های پروژه"
                  onClick={(event) => event.stopPropagation()}
                />
              }
            >
              <MoreHorizontalIcon className="size-3.5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" dir="rtl">
              <DropdownMenuGroup>
                <DropdownMenuItem onClick={() => onOpenWorkspace(workspace.id)}>
                  <FolderIcon />
                  {home ? "باز کردن خانه" : "باز کردن پروژه"}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onNewChat(workspace.id)}>
                  <PlusIcon />
                  گفتگوی جدید
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onEditWorkspace(workspace)}>
                  <PencilIcon />
                  ویرایش
                </DropdownMenuItem>
                {home ? null : (
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={() => onDeleteWorkspace(workspace)}
                  >
                    <Trash2Icon />
                    حذف پروژه
                  </DropdownMenuItem>
                )}
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {chats.length > 0 ? (
          <CollapsibleContent>
            <SidebarMenu className="gap-0.5 py-0.5">
              {chats.map((chat) => (
                <SidebarChatRow
                  key={chat.id}
                  chat={chat}
                  isRunning={runningChatIds.has(chat.id)}
                  activeChatId={activeChatId}
                  typingTitles={typingTitles}
                  indented
                  onSelect={onSelectChat}
                  onRename={onRenameChat}
                  onDelete={onDeleteChat}
                  onPin={onPinChat}
                />
              ))}
            </SidebarMenu>
          </CollapsibleContent>
        ) : null}
      </div>
    </Collapsible>
  );
}
