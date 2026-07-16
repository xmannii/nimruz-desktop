"use client";

import {
  MessageAction,
  MessageActions,
} from "@/components/ai-elements/message";
import { cn } from "@/lib/utils";
import { CopyIcon, RefreshCwIcon } from "lucide-react";
import { toast } from "sonner";

type ChatMessageActionsProps = {
  className?: string;
  disabled?: boolean;
  onCopy?: () => void;
  onRegenerate?: () => void;
  showCopy?: boolean;
  showRegenerate?: boolean;
};

export function ChatMessageActions({
  className,
  disabled = false,
  onCopy,
  onRegenerate,
  showCopy = false,
  showRegenerate = false,
}: ChatMessageActionsProps) {
  if (!showCopy && !showRegenerate) return null;

  return (
    <MessageActions
      className={cn(
        "mt-1 ms-auto w-fit justify-end gap-0.5",
        disabled && "pointer-events-none opacity-40",
        className
      )}
    >
      {showCopy && onCopy ? (
        <MessageAction
          tooltip="کپی"
          label="کپی"
          disabled={disabled}
          onClick={onCopy}
        >
          <CopyIcon />
        </MessageAction>
      ) : null}
      {showRegenerate && onRegenerate ? (
        <MessageAction
          tooltip="تولید دوباره"
          label="تولید دوباره"
          disabled={disabled}
          onClick={onRegenerate}
        >
          <RefreshCwIcon />
        </MessageAction>
      ) : null}
    </MessageActions>
  );
}

export async function copyTextToClipboard(text: string, successMessage: string) {
  const trimmed = text.trim();
  if (!trimmed) {
    toast.error("متنی برای کپی وجود ندارد.");
    return;
  }

  try {
    await navigator.clipboard.writeText(trimmed);
    toast.success(successMessage);
  } catch {
    toast.error("کپی ناموفق بود.");
  }
}
