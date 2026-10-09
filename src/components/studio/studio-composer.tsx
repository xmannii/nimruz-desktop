"use client";

import { ModelPicker } from "@/components/chat/model-picker";
import { useStudioAssistantModel } from "@/hooks/use-studio-assistant-model";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { requestPromptEnhancement } from "@/lib/studio/enhance";
import { textDirection } from "@/lib/studio/audio-tags";
import { StudioAudioTagHighlights } from "@/components/studio/studio-audio-tag-text";
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
 * Prompt dock shared by the Studio tabs. By default Enter generates and
 * Shift+Enter adds a line; long-form scripts use Ctrl/⌘+Enter instead.
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
  submitOnEnter = true,
  tall = false,
  flashSignal = 0,
  highlightAudioTags = false,
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
  /** "speech-tags" adds ElevenLabs audio tags instead of rewriting. */
  enhanceKind?: "image" | "video" | "speech-tags";
  submitOnEnter?: boolean;
  tall?: boolean;
  /** Bump to briefly highlight and focus the box (e.g. text handed over). */
  flashSignal?: number;
  /** Colour ElevenLabs audio tags like [whispers] behind the text. */
  highlightAudioTags?: boolean;
  className?: string;
}) {
  const backdropRef = useRef<HTMLDivElement>(null);
  const direction = value.trim() ? textDirection(value) : "rtl";
  const maxHeight = tall ? 320 : 240;
  const enhanceCopy =
    enhanceKind === "speech-tags"
      ? {
          label: "افزودن حس با برچسب‌های صوتی",
          tooltip: "برچسب‌هایی مثل [whispers] و [laughs] اضافه می‌شود؛ کلمات تغییر نمی‌کنند",
          done: "برچسب‌های حس اضافه شد.",
        }
      : {
          label: "بهبود متن با هوش مصنوعی",
          tooltip: "بهبود و ترجمه درخواست به انگلیسی دقیق",
          done: "متن درخواست بهبود یافت.",
        };
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const enhanceAbort = useRef<AbortController | null>(null);
  const [isEnhancing, setIsEnhancing] = useState(false);
  const assistant = useStudioAssistantModel();
  const defaultModelRef = assistant.model;

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, maxHeight)}px`;
  }, [value, maxHeight]);

  useEffect(() => () => enhanceAbort.current?.abort(), []);

  const [flashing, setFlashing] = useState(false);
  useEffect(() => {
    if (!flashSignal) return;
    const textarea = textareaRef.current;
    textarea?.focus();
    textarea?.setSelectionRange(textarea.value.length, textarea.value.length);
    setFlashing(true);
    const timer = window.setTimeout(() => setFlashing(false), 900);
    return () => window.clearTimeout(timer);
  }, [flashSignal]);

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
      toast.success(enhanceCopy.done, {
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
        data-studio-tour="composer"
        className={cn(
          "relative flex flex-col rounded-3xl border border-border bg-card shadow-xs transition-[border-color,box-shadow] duration-300 focus-within:border-foreground/25",
          flashing && "border-primary/50 ring-4 ring-primary/15"
        )}
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        {attachments ? <div className="px-3 pt-3">{attachments}</div> : null}
        <div className="relative">
          {highlightAudioTags && value ? (
            // Mirrors the textarea's text box so tag highlights sit exactly
            // under the tags; the textarea above stays fully editable.
            <div
              ref={backdropRef}
              aria-hidden
              dir={direction}
              className={cn(
                "pointer-events-none absolute inset-0 overflow-hidden px-4 pt-3.5 pb-1 text-[15px] leading-7 break-words whitespace-pre-wrap text-transparent",
                tall ? "max-h-80" : "max-h-60"
              )}
            >
              <StudioAudioTagHighlights text={value} />
            </div>
          ) : null}
          <textarea
            ref={textareaRef}
            // Empty → RTL so the Persian placeholder aligns right; otherwise
            // the first real letter decides, ignoring leading audio tags.
            dir={direction}
            value={value}
            rows={1}
            maxLength={maxLength}
            placeholder={placeholder}
            aria-label={placeholder}
            readOnly={isEnhancing}
            className={cn(
              "relative block w-full resize-none bg-transparent px-4 pt-3.5 pb-1 text-[15px] leading-7 break-words outline-none placeholder:text-start placeholder:text-muted-foreground/60",
              tall ? "max-h-80 min-h-[5.5rem]" : "max-h-60 min-h-[3.25rem]"
            )}
            onChange={(event) => onValueChange(event.target.value)}
            onScroll={(event) => {
              if (backdropRef.current) backdropRef.current.scrollTop = event.currentTarget.scrollTop;
            }}
            onPaste={handlePaste}
            onKeyDown={(event) => {
              if (
                event.key === "Enter" &&
                !event.nativeEvent.isComposing &&
                (submitOnEnter
                  ? !event.shiftKey
                  : event.metaKey || event.ctrlKey)
              ) {
                event.preventDefault();
                submit();
              }
            }}
          />
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
              title={`${submitLabel} (${submitOnEnter ? "Enter" : "Ctrl/⌘ + Enter"})`}
            >
              {isSubmitting ? <Spinner /> : <ArrowUpIcon className="size-4.5" />}
            </Button>
            {enhanceKind ? (
              <span data-studio-tour="enhance" className="flex items-center">
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="rounded-full text-muted-foreground hover:text-foreground"
                        aria-label={enhanceCopy.label}
                        disabled={!value.trim() || !defaultModelRef || isEnhancing}
                        onClick={() => void enhance()}
                      />
                    }
                  >
                    {isEnhancing ? <Spinner /> : <SparklesIcon />}
                  </TooltipTrigger>
                  <TooltipContent>
                    {defaultModelRef
                      ? `${enhanceCopy.tooltip} · ${assistant.label}`
                      : "برای این کار یک مدل گفتگو فعال کنید"}
                  </TooltipContent>
                </Tooltip>
                {defaultModelRef ? (
                  <ModelPicker
                    trigger="chevron"
                    align="end"
                    heading="مدل دستیار"
                    description="برای بهبود درخواست، برچسب‌های صوتی و اصلاح رونویسی در استودیو."
                    value={defaultModelRef}
                    onValueChange={assistant.setModel}
                    disabled={isEnhancing}
                  />
                ) : null}
              </span>
            ) : null}
            {value && !isEnhancing ? (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="rounded-full text-muted-foreground hover:text-foreground"
                aria-label="پاک کردن متن"
                title="پاک کردن متن"
                onClick={() => {
                  onValueChange("");
                  textareaRef.current?.focus();
                }}
              >
                <XIcon />
              </Button>
            ) : null}
          </div>
          <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-1.5">{toolbar}</div>
        </div>
      </form>
      <div className="flex min-h-4 items-center justify-between gap-3 px-3 text-[11px] text-muted-foreground/80">
        <span className="hidden sm:inline">
          {submitOnEnter ? (
            <>
              <kbd className="font-sans">Enter</kbd> ساخت · <kbd className="font-sans">Shift+Enter</kbd> خط جدید
            </>
          ) : (
            <>
              <kbd className="font-sans">Ctrl/⌘+Enter</kbd> ساخت
            </>
          )}
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
