"use client";

import { FileTranscriptionPage } from "@/components/speech/file-transcription-page";
import { useSpeech } from "@/components/speech/speech-provider";
import { useStudio } from "@/components/studio/studio-context";
import { Button } from "@/components/ui/button";
import { useStudioItems } from "@/hooks/use-studio-items";
import { copyText } from "@/lib/studio/actions";
import {
  formatRelativeTime,
  formatStudioDuration,
} from "@/lib/studio/format";
import type { StudioItem } from "@/lib/studio/types";
import {
  AudioLinesIcon,
  CopyIcon,
  FileTextIcon,
  SparklesIcon,
  Trash2Icon,
} from "lucide-react";
import { toast } from "sonner";

function TranscriptRow({ item }: { item: StudioItem }) {
  const { openItem } = useStudio();
  const text = item.correctedText ?? item.text ?? "";
  const duration = formatStudioDuration(item.durationSeconds);

  return (
    <article className="group/row relative flex gap-3 rounded-2xl p-3 transition-colors hover:bg-muted/60">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground ring-1 ring-foreground/5">
        {item.hasMedia ? <AudioLinesIcon className="size-4" /> : <FileTextIcon className="size-4" />}
      </span>
      <button
        type="button"
        className="min-w-0 flex-1 text-start after:absolute after:inset-0 after:rounded-2xl focus-visible:outline-none focus-visible:after:ring-[3px] focus-visible:after:ring-ring/50"
        onClick={() => openItem(item)}
      >
        <span className="flex items-center gap-2">
          <span dir="auto" className="truncate text-sm font-medium">{item.title}</span>
          {item.correctedText ? (
            <SparklesIcon className="size-3 shrink-0 text-primary" aria-label="اصلاح‌شده" />
          ) : null}
        </span>
        <span dir="auto" className="mt-1 line-clamp-2 text-xs leading-6 text-muted-foreground">
          {text}
        </span>
        <span className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground/80">
          <time dateTime={new Date(item.createdAt).toISOString()}>
            {formatRelativeTime(item.createdAt)}
          </time>
          {duration ? (
            <>
              <span aria-hidden>·</span>
              <span className="tabular-nums">{duration}</span>
            </>
          ) : null}
          <span aria-hidden>·</span>
          <span>{text.split(/\s+/).filter(Boolean).length.toLocaleString("fa-IR")} واژه</span>
        </span>
      </button>
      <div className="relative z-10 flex shrink-0 items-start gap-0.5 opacity-0 transition-opacity group-hover/row:opacity-100 group-focus-within/row:opacity-100">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="کپی متن"
          onClick={async () => {
            try {
              await copyText(text);
              toast.success("متن کپی شد.");
            } catch {
              toast.error("کپی ناموفق بود.");
            }
          }}
        >
          <CopyIcon />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="حذف"
          onClick={() => void window.desktop.studio.delete(item.id)}
        >
          <Trash2Icon />
        </Button>
      </div>
    </article>
  );
}

export function TranscribeStudio() {
  const { items: sessionItems } = useSpeech();
  const { items, hasMore, loadMore } = useStudioItems({ kind: "transcript" });
  const sessionIds = new Set(sessionItems.map((item) => item.id));
  const previous = items.filter((item) => !sessionIds.has(item.id));

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-6 sm:px-8">
      <FileTranscriptionPage embedded />

      {previous.length > 0 ? (
        <section aria-label="رونویسی‌های قبلی" className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between px-1">
            <h2 className="font-medium">رونویسی‌های قبلی</h2>
            <span className="text-xs text-muted-foreground">
              {previous.length.toLocaleString("fa-IR")}
              {hasMore ? "+" : ""} مورد
            </span>
          </div>
          <div className="flex flex-col rounded-3xl border border-border/60 bg-card p-1.5">
            {previous.map((item) => (
              <TranscriptRow key={item.id} item={item} />
            ))}
          </div>
          {hasMore ? (
            <Button type="button" variant="ghost" className="self-center rounded-full" onClick={loadMore}>
              نمایش موارد قدیمی‌تر
            </Button>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
