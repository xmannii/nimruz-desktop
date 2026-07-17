"use client";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { LocalChat } from "@/lib/chat/storage";
import { exportChatJson, exportChatMarkdown } from "@/lib/chat/export-chat";
import { cn } from "@/lib/utils";
import {
  DownloadIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PinIcon,
  PinOffIcon,
  Trash2Icon,
} from "lucide-react";

export const sidebarInlineMenuTriggerClassName =
  "flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground/75 transition-opacity hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring data-popup-open:bg-sidebar-accent data-popup-open:text-sidebar-accent-foreground";

/** Hidden until row hover, focus, active, or menu open */
export const sidebarRowMenuTriggerClassName = cn(
  sidebarInlineMenuTriggerClassName,
  "pointer-events-none opacity-0",
  "group-hover/row:pointer-events-auto group-hover/row:opacity-100",
  "group-focus-within/row:pointer-events-auto group-focus-within/row:opacity-100",
  "group-data-[active=true]/row:pointer-events-auto group-data-[active=true]/row:opacity-100",
  "focus-visible:pointer-events-auto focus-visible:opacity-100",
  "data-popup-open:pointer-events-auto data-popup-open:opacity-100"
);

/** Plus on project row — visible when hovering project header or any chat inside. */
export const sidebarProjectNewChatClassName = cn(
  sidebarInlineMenuTriggerClassName,
  "pointer-events-none opacity-0 transition-opacity",
  "group-hover/project-block:pointer-events-auto group-hover/project-block:opacity-100",
  "focus-visible:pointer-events-auto focus-visible:opacity-100"
);

type SidebarChatMenuProps = {
  chat: LocalChat;
  onRename: (chat: LocalChat) => void;
  onDelete: (chat: LocalChat) => void;
  onPin: (chat: LocalChat, pinned: boolean) => void;
  className?: string;
  triggerClassName?: string;
};

export function SidebarChatMenu({
  chat,
  onRename,
  onDelete,
  onPin,
  className,
  triggerClassName = sidebarRowMenuTriggerClassName,
}: SidebarChatMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            className={cn(triggerClassName, className)}
            aria-label={`گزینه‌های ${chat.title}`}
            title="گزینه‌های گفتگو"
            onClick={(event) => event.stopPropagation()}
          />
        }
      >
        <MoreHorizontalIcon className="size-3.5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" dir="rtl">
        <DropdownMenuGroup>
          <DropdownMenuItem onClick={() => onPin(chat, !chat.pinned)}>
            {chat.pinned ? <PinOffIcon /> : <PinIcon />}
            {chat.pinned ? "برداشتن سنجاق" : "سنجاق کردن"}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => exportChatMarkdown(chat)}>
            <DownloadIcon />
            خروجی Markdown
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => exportChatJson(chat)}>
            <DownloadIcon />
            خروجی JSON
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onRename(chat)}>
            <PencilIcon />
            تغییر نام
          </DropdownMenuItem>
          <DropdownMenuItem
            variant="destructive"
            onClick={() => onDelete(chat)}
          >
            <Trash2Icon />
            حذف گفتگو
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
