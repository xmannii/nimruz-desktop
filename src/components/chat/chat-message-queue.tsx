"use client";

import type { ChatQueuedMessage } from "@/lib/chat/queue";
import { Button } from "@/components/ui/button";
import { CornerDownLeftIcon, ListPlusIcon, XIcon } from "lucide-react";

export function ChatMessageQueue({
  messages,
  onRemove,
}: {
  messages: ChatQueuedMessage[];
  onRemove: (id: string) => void;
}) {
  if (messages.length === 0) return null;

  return (
    <div
      dir="rtl"
      className="mx-auto flex w-full max-w-3xl shrink-0 flex-col gap-1 px-3 pb-1 sm:px-6"
    >
      {messages.map((message) => (
        <div
          key={message.id}
          className="flex items-center gap-2 rounded-lg border bg-muted/40 px-2.5 py-1.5 text-xs"
        >
          {message.kind === "steer" ? (
            <CornerDownLeftIcon className="size-3.5 shrink-0 text-primary" />
          ) : (
            <ListPlusIcon className="size-3.5 shrink-0 text-muted-foreground" />
          )}
          <span className="shrink-0 font-medium">
            {message.kind === "steer" ? "هدایت بعدی" : "در صف"}
          </span>
          <span className="min-w-0 flex-1 truncate text-muted-foreground">
            {message.text}
          </span>
          <Button
            type="button"
            size="icon-xs"
            variant="ghost"
            aria-label="حذف از صف"
            onClick={() => onRemove(message.id)}
          >
            <XIcon />
          </Button>
        </div>
      ))}
    </div>
  );
}
