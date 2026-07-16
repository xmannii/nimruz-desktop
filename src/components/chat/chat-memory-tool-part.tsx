"use client";

import { ChatToolInvocation } from "@/components/chat/chat-tool-invocation";
import {
  MEMORY_CATEGORY_LABELS,
  type MemoryCategory,
} from "@/lib/settings/memories";
import { BrainIcon } from "lucide-react";

type SaveMemoryToolPart = {
  type: "tool-save_memory";
  toolCallId: string;
  state: string;
  input?: {
    content?: string;
    category?: MemoryCategory;
  };
  output?: {
    success?: boolean;
    id?: string;
    error?: string;
  };
};

type DeleteMemoryToolPart = {
  type: "tool-delete_memory";
  toolCallId: string;
  state: string;
  output?: {
    success?: boolean;
    deleted?: boolean;
  };
};

export function ChatMemoryToolPart({
  part,
}: {
  part: SaveMemoryToolPart | DeleteMemoryToolPart;
}) {
  const isSave = part.type === "tool-save_memory";
  const isLoading =
    part.state === "input-streaming" || part.state === "input-available";
  const isError = part.state === "output-error";

  if (isSave) {
    const savePart = part as SaveMemoryToolPart;
    const category = savePart.input?.category ?? "fact";
    const content = savePart.input?.content?.trim();

    return (
      <ChatToolInvocation
        icon={<BrainIcon />}
        label={
          isLoading
            ? "در حال ذخیره خاطره…"
            : isError
              ? "خطا در ذخیره خاطره"
              : `خاطره ذخیره شد · ${MEMORY_CATEGORY_LABELS[category]}`
        }
        isLoading={isLoading}
        isError={isError}
        expandable={Boolean(content) && !isLoading && !isError}
      >
        {content ? <p className="leading-6">{content}</p> : null}
      </ChatToolInvocation>
    );
  }

  return (
    <ChatToolInvocation
      icon={<BrainIcon />}
      label={
        isLoading
          ? "در حال حذف خاطره…"
          : isError
            ? "خطا در حذف خاطره"
            : "خاطره حذف شد"
      }
      isLoading={isLoading}
      isError={isError}
    />
  );
}
