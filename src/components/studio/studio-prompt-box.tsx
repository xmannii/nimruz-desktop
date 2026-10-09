"use client";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Kbd } from "@/components/ui/kbd";
import { cn } from "@/lib/utils";
import { ArrowUpIcon } from "lucide-react";
import {
  useEffect,
  useRef,
  type ClipboardEvent,
  type ReactNode,
} from "react";

export function StudioPromptBox({
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
  hint,
  onPasteImages,
  minRows = 3,
  textareaDir = "auto",
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
  hint?: ReactNode;
  onPasteImages?: (files: File[]) => void;
  minRows?: number;
  textareaDir?: "auto" | "rtl" | "ltr";
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 320)}px`;
  }, [value]);

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
    <form
      className="group/prompt flex flex-col overflow-hidden rounded-3xl border border-input bg-card shadow-sm ring-1 ring-foreground/5 transition-shadow focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/40"
      onSubmit={(event) => {
        event.preventDefault();
        if (canSubmit && !isSubmitting) onSubmit();
      }}
    >
      {attachments ? <div className="px-3 pt-3">{attachments}</div> : null}
      <textarea
        ref={textareaRef}
        dir={textareaDir}
        value={value}
        rows={minRows}
        maxLength={maxLength}
        placeholder={placeholder}
        aria-label={placeholder}
        className="w-full resize-none bg-transparent px-4 pt-3.5 pb-2 text-[15px] leading-7 outline-none placeholder:text-muted-foreground/70"
        onChange={(event) => onValueChange(event.target.value)}
        onPaste={handlePaste}
        onKeyDown={(event) => {
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            if (canSubmit && !isSubmitting) onSubmit();
          }
        }}
      />
      <div className="flex flex-wrap items-center gap-2 px-2.5 pb-2.5">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
          {toolbar}
        </div>
        <div className="ms-auto flex items-center gap-2">
          {hint ? (
            <span className="hidden text-[11px] text-muted-foreground sm:inline">
              {hint}
            </span>
          ) : null}
          <Button
            type="submit"
            className="h-9 rounded-full ps-3 pe-4"
            disabled={!canSubmit || isSubmitting}
            title="Ctrl/⌘ + Enter"
          >
            {isSubmitting ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <ArrowUpIcon data-icon="inline-start" />
            )}
            {submitLabel}
          </Button>
        </div>
      </div>
    </form>
  );
}

export function StudioShortcutHint() {
  return (
    <span className="inline-flex items-center gap-1">
      <Kbd>⌘</Kbd>
      <Kbd>Enter</Kbd>
    </span>
  );
}

export type StudioChipOption = { value: string; label: string; detail?: string };

/** Compact pill select used in the prompt toolbar. */
export function StudioOptionChip({
  value,
  onValueChange,
  options,
  label,
  icon,
  disabled = false,
  className,
}: {
  value: string;
  onValueChange: (value: string) => void;
  options: StudioChipOption[];
  label: string;
  icon?: ReactNode;
  disabled?: boolean;
  className?: string;
}) {
  const selected = options.find((option) => option.value === value);
  return (
    <Select
      value={value}
      onValueChange={(next) => {
        if (typeof next === "string" && next) onValueChange(next);
      }}
      disabled={disabled || options.length === 0}
    >
      <SelectTrigger
        size="sm"
        aria-label={label}
        className={cn(
          "h-8 gap-1.5 rounded-full border-border/70 bg-muted/60 px-2.5 text-xs font-medium shadow-none hover:bg-muted dark:bg-muted/60",
          className
        )}
      >
        {icon}
        <SelectValue>{selected?.label ?? label}</SelectValue>
      </SelectTrigger>
      <SelectContent align="start" side="bottom" alignItemWithTrigger={false}>
        <SelectGroup>
          <SelectLabel>{label}</SelectLabel>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              <span className="flex w-full items-center justify-between gap-4">
                <span>{option.label}</span>
                {option.detail ? (
                  <span className="text-[10px] text-muted-foreground">
                    {option.detail}
                  </span>
                ) : null}
              </span>
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}

/** Tiny rectangle that previews an aspect ratio inside option chips. */
export function AspectRatioGlyph({ ratio }: { ratio: string }) {
  const [width, height] = ratio.split(":").map(Number);
  const scale = 12 / Math.max(width || 1, height || 1);
  return (
    <span
      aria-hidden
      className="inline-block shrink-0 rounded-[2px] border-[1.5px] border-current opacity-70"
      style={{
        width: `${Math.max(5, (width || 1) * scale)}px`,
        height: `${Math.max(5, (height || 1) * scale)}px`,
      }}
    />
  );
}
