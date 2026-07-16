"use client";

import { cn } from "@/lib/utils";
import { BotIcon, XIcon } from "lucide-react";

type SelectedExpertBadgeProps = {
  name: string;
  onClear: () => void;
  disabled?: boolean;
  className?: string;
};

export function SelectedExpertBadge({
  name,
  onClear,
  disabled = false,
  className,
}: SelectedExpertBadgeProps) {
  return (
    <div dir="rtl" className={cn("flex items-start px-3 pt-2.5", className)}>
      <span className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-primary/25 bg-primary/10 py-1 ps-2.5 pe-1.5 text-xs text-foreground">
        <BotIcon className="size-3.5 shrink-0 text-primary" aria-hidden />
        <span className="truncate font-medium">{name}</span>
        <button
          type="button"
          className="inline-flex size-5 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-primary/15 hover:text-foreground disabled:opacity-50"
          aria-label="حذف متخصص"
          onClick={onClear}
          disabled={disabled}
        >
          <XIcon className="size-3" />
        </button>
      </span>
    </div>
  );
}
