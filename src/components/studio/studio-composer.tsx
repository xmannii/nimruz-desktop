"use client";

import { useAppShell } from "@/components/app-shell-context";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { requestPromptEnhancement } from "@/lib/studio/enhance";
import { cn } from "@/lib/utils";
import { ArrowUpIcon, SparklesIcon, XIcon } from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type ReactNode,
} from "react";
import { toast } from "sonner";

/**
 * Prompt dock shared by the image and video tabs. Enter generates and
 * Shift+Enter adds a line; "use again" on any result restores its prompt.
 */
export function StudioComposer({
  value,
  onValueChange,
  onSubmit,
  placeholder,
  maxLength,
  canSubmit,
  isSubmitting = false,
  submitLabel,
  attachments,
  toolbar,
  footer,
  notice,
  onPasteImages,
  enhanceKind,
  className,
}: {
  value: string;
  onValueChange: (value: string) => void;
  onSubmit: () => void;
  placeholder: string;
  maxLength: number;
  canSubmit: boolean;
  isSubmitting?: boolean;
  submitLabel: string;
  attachments?: ReactNode;
  toolbar?: ReactNode;
  footer?: ReactNode;
  notice?: ReactNode;
  onPasteImages?: (files: File[]) => void;
  enhanceKind?: "image" | "video";
  className?: string;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const enhanceAbort = useRef<AbortController | null>(null);
  const [isEnhancing, setIsEnhancing] = useState(false);
  const { defaultModelRef } = useAppShell();

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 240)}px`;
  }, [value]);

  useEffect(() => () => enhanceAbort.current?.abort(), []);

  function submit() {
    if (canSubmit && !isSubmitting && !isEnhancing) onSubmit();
  }

  async function enhance() {
    if (!enhanceKind || !defaultModelRef || !value.trim()) return;
    const original = value;
    const controller = new AbortController();
    enhanceAbort.current = controller;
    setIsEnhancing(true);
    try {
      const prompt = await requestPromptEnhancement({
        kind: enhanceKind,
        prompt: original,
        model: defaultModelRef,
        signal: controller.signal,
      });
      onValueChange(prompt);
      toast.success("متن درخواست بهبود یافت.", {
        action: { label: "بازگشت", onClick: () => onValueChange(original) },
      });
      textareaRef.current?.focus();
    } catch (error) {
      if (!controller.signal.aborted) {
        toast.error(error instanceof Error ? error.message : "بهبود متن ناموفق بود.");
      }
    } finally {
      setIsEnhancing(false);
    }
  }

  function handlePaste(event: ClipboardEvent<HTMLTextAreaElement>) {
    if (!onPasteImages) return;
    const files = Array.from(event.clipboardData.files).filter((file) =>
      file.type.startsWith("image/")
    );
    if (files.length === 0) return;
    event.preventDefault();
    onPasteImages(files);
  }

  return (
    <div className={cn("mx-auto flex w-full max-w-3xl flex-col gap-2", className)}>
      {notice}
      <form
        className="relative flex flex-col rounded-3xl border border-border bg-card shadow-xs transition-colors focus-within:border-foreground/25"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        {attachments ? <div className="px-3 pt-3">{attachments}</div> : null}
        <div className="relative">
          <textarea
            ref={textareaRef}
            // Empty → RTL so the Persian placeholder aligns right; typed text picks its own direction.
            dir={value.trim() ? "auto" : "rtl"}
            value={value}
            rows={1}
            maxLength={maxLength}
            placeholder={placeholder}
            aria-label={placeholder}
            readOnly={isEnhancing}
            className="block max-h-60 min-h-[3.25rem] w-full resize-none bg-transparent px-4 pt-3.5 pb-1 pe-10 text-[15px] leading-7 outline-none placeholder:text-start placeholder:text-muted-foreground/60"
            onChange={(event) => onValueChange(event.target.value)}
            onPaste={handlePaste}
            onKeyDown={(event) => {
              if (
                event.key === "Enter" &&
                !event.shiftKey &&
                !event.nativeEvent.isComposing
              ) {
                event.preventDefault();
                submit();
              }
            }}
          />
          {value && !isEnhancing ? (
            <button
              type="button"
              aria-label="پاک کردن متن"
              className="absolute end-3 top-3.5 flex size-6 items-center justify-center rounded-full text-muted-foreground/70 transition-colors hover:bg-muted hover:text-foreground"
              onClick={() => {
                onValueChange("");
                textareaRef.current?.focus();
              }}
            >
              <XIcon className="size-3.5" />
            </button>
          ) : null}
        </div>
        {/* RTL: send and enhance sit at the right (start); options at the left (end). */}
        <div className="flex items-end gap-2 px-2.5 pb-2.5 pt-1">
          <div className="flex shrink-0 items-center gap-1.5">
            <Button
              type="submit"
              size="icon"
              className="size-9 rounded-full"
              disabled={!canSubmit || isSubmitting || isEnhancing}
              aria-label={submitLabel}
              title={`${submitLabel} (Enter)`}
            >
              {isSubmitting ? <Spinner /> : <ArrowUpIcon className="size-4.5" />}
            </Button>
            {enhanceKind ? (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className="rounded-full text-muted-foreground hover:text-foreground"
                      aria-label="بهبود متن با هوش مصنوعی"
                      disabled={!value.trim() || !defaultModelRef || isEnhancing}
                      onClick={() => void enhance()}
                    />
                  }
                >
                  {isEnhancing ? <Spinner /> : <SparklesIcon />}
                </TooltipTrigger>
                <TooltipContent>
                  {defaultModelRef
                    ? "بهبود و ترجمه درخواست به انگلیسی دقیق"
                    : "برای بهبود متن یک مدل گفتگو فعال کنید"}
                </TooltipContent>
              </Tooltip>
            ) : null}
          </div>
          <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-1.5">{toolbar}</div>
        </div>
      </form>
      <div className="flex min-h-4 items-center justify-between gap-3 px-3 text-[11px] text-muted-foreground/80">
        <span className="hidden sm:inline">
          <kbd className="font-sans">Enter</kbd> ساخت · <kbd className="font-sans">Shift+Enter</kbd> خط جدید
        </span>
        <span className="ms-auto">{footer}</span>
      </div>
    </div>
  );
}

/** Small removable thumbnail used for reference images and first frames. */
export function StudioAttachmentThumb({
  src,
  label,
  onRemove,
  muted = false,
  wide = false,
}: {
  src: string;
  label: string;
  onRemove: () => void;
  muted?: boolean;
  wide?: boolean;
}) {
  return (
    <div
      className={cn(
        "group/thumb relative h-16 shrink-0 overflow-hidden rounded-xl ring-1 ring-foreground/10",
        wide ? "w-auto max-w-28" : "w-16",
        muted && "opacity-40 grayscale"
      )}
    >
      <img src={src} alt={label} className="size-full object-cover" />
      <button
        type="button"
        aria-label={`حذف ${label}`}
        className="absolute end-1 top-1 flex size-5 items-center justify-center rounded-full bg-black/60 text-white opacity-0 backdrop-blur transition-opacity group-hover/thumb:opacity-100 focus-visible:opacity-100"
        onClick={onRemove}
      >
        <XIcon className="size-3" />
      </button>
    </div>
  );
}
