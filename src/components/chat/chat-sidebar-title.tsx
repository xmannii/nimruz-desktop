"use client";

import { cn } from "@/lib/utils";

type ChatSidebarTitleProps = {
  title: string;
  typingTitle?: string;
  className?: string;
};

export function ChatSidebarTitle({
  title,
  typingTitle,
  className,
}: ChatSidebarTitleProps) {
  const isTyping = typingTitle !== undefined;
  const display = isTyping ? typingTitle : title;

  return (
    <span className={cn("inline-flex min-w-0 items-center truncate", className)}>
      <span className="truncate">{display}</span>
      {isTyping ? (
        <span
          aria-hidden
          className="ms-0.5 inline-block w-0.5 shrink-0 animate-pulse text-primary"
        >
          │
        </span>
      ) : null}
    </span>
  );
}
