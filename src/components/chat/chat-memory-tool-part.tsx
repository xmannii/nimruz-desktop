"use client";

import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import {
  MEMORY_CATEGORY_LABELS,
  type MemoryCategory,
} from "@/lib/settings/memories";
import { cn } from "@/lib/utils";
import { BrainIcon, Trash2Icon } from "lucide-react";

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

const shellClassName =
  "flex w-full items-center gap-1.5 rounded-lg border border-border/60 bg-muted/35 px-2 py-1 text-xs leading-5";

export function ChatMemoryToolPart({
  part,
}: {
  part: SaveMemoryToolPart | DeleteMemoryToolPart;
}) {
  const isSave = part.type === "tool-save_memory";
  const isLoading =
    part.state === "input-streaming" || part.state === "input-available";

  if (isLoading) {
    return (
      <div dir="rtl" className={cn(shellClassName, "text-muted-foreground")}>
        <Spinner className="size-3 shrink-0" />
        <span>{isSave ? "در حال ذخیره خاطره…" : "در حال حذف خاطره…"}</span>
      </div>
    );
  }

  if (part.state === "output-error") {
    return (
      <div
        dir="rtl"
        className={cn(
          shellClassName,
          "border-destructive/30 bg-destructive/5 text-destructive"
        )}
      >
        <BrainIcon className="size-3 shrink-0" />
        <span className="font-medium">خطا در مدیریت خاطره</span>
      </div>
    );
  }

  if (isSave) {
    const savePart = part as SaveMemoryToolPart;
    const category = savePart.input?.category ?? "fact";

    return (
      <div dir="rtl" className={shellClassName}>
        <BrainIcon className="size-3 shrink-0 text-muted-foreground" />
        <span className="shrink-0 font-medium text-foreground">خاطره ذخیره شد</span>
        <Badge
          variant="secondary"
          className="h-4 shrink-0 px-1 text-[10px] leading-none"
        >
          {MEMORY_CATEGORY_LABELS[category]}
        </Badge>
        {savePart.input?.content ? (
          <span
            dir="rtl"
            className="min-w-0 truncate text-muted-foreground"
          >
            {savePart.input.content}
          </span>
        ) : null}
      </div>
    );
  }

  return (
    <div
      dir="rtl"
      className={cn(shellClassName, "text-muted-foreground")}
    >
      <Trash2Icon className="size-3 shrink-0" />
      <span>خاطره حذف شد</span>
    </div>
  );
}
