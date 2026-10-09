"use client";

import { useAppShell } from "@/components/app-shell-context";
import { StudioAudioPlayer } from "@/components/studio/studio-audio-player";
import { studioModelKey, useStudio } from "@/components/studio/studio-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { copyText, retryStudioItem } from "@/lib/studio/actions";
import {
  formatStudioCost,
  formatStudioDuration,
  isStudioItemBusy,
  STUDIO_KIND_LABELS,
  studioMediaUrl,
} from "@/lib/studio/format";
import { findPreset, IMAGE_STYLES, VIDEO_CAMERA_MOVES } from "@/lib/studio/presets";
import type { StudioItem } from "@/lib/studio/types";
import { DEFAULT_CORRECTION_PROMPT } from "@/lib/speech/correction";
import { requestTranscriptCorrection } from "@/lib/speech/request-correction";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  CopyIcon,
  DownloadIcon,
  FilmIcon,
  FolderOpenIcon,
  ImagePlusIcon,
  PencilLineIcon,
  RotateCcwIcon,
  SparklesIcon,
  Trash2Icon,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2 text-xs">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 text-end font-medium break-words">{children}</span>
    </div>
  );
}

function formatDate(timestamp: number) {
  return new Intl.DateTimeFormat("fa-IR", { dateStyle: "medium", timeStyle: "short" }).format(timestamp);
}

function TextBlock({ text }: { text: string }) {
  return (
    <div dir="auto" className="max-h-[50vh] overflow-y-auto rounded-2xl bg-muted/60 p-4 text-sm leading-8 whitespace-pre-wrap">
      {text}
    </div>
  );
}

function MediaStage({ item }: { item: StudioItem }) {
  if (item.kind === "image" && item.hasMedia) {
    return <img src={studioMediaUrl(item)} alt={item.prompt} className="max-h-full max-w-full rounded-lg object-contain" />;
  }
  if (item.kind === "video" && item.hasMedia) {
    return (
      <video
        key={item.id}
        src={studioMediaUrl(item)}
        controls
        autoPlay
        loop
        playsInline
        className="max-h-full max-w-full rounded-lg"
      />
    );
  }
  return null;
}

export function StudioItemViewer({
  item,
  siblings,
  onNavigate,
  onOpenChange,
}: {
  item: StudioItem | null;
  siblings: StudioItem[];
  onNavigate: (item: StudioItem) => void;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={Boolean(item)} onOpenChange={onOpenChange}>
      {item ? (
        <ViewerContent
          key={item.id}
          item={item}
          siblings={siblings}
          onNavigate={onNavigate}
          close={() => onOpenChange(false)}
        />
      ) : null}
    </Dialog>
  );
}

function ViewerContent({
  item,
  siblings,
  onNavigate,
  close,
}: {
  item: StudioItem;
  siblings: StudioItem[];
  onNavigate: (item: StudioItem) => void;
  close: () => void;
}) {
  const { sendDraft } = useStudio();
  const { defaultModelRef } = useAppShell();
  const [isCorrecting, setIsCorrecting] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const isVisual = item.kind === "image" || item.kind === "video";
  const index = siblings.findIndex((candidate) => candidate.id === item.id);
  const previous = index > 0 ? siblings[index - 1] : null;
  const next = index >= 0 && index < siblings.length - 1 ? siblings[index + 1] : null;
  const voice = typeof item.params.voice === "string" ? item.params.voice : null;
  const styleId = typeof item.params.style === "string" ? item.params.style : null;
  const style = styleId ? findPreset(item.kind === "video" ? VIDEO_CAMERA_MOVES : IMAGE_STYLES, styleId) : null;
  const cost = formatStudioCost(item.cost);
  const duration =
    formatStudioDuration(item.durationSeconds) ??
    (typeof item.params.duration === "number" ? `${item.params.duration.toLocaleString("fa-IR")} ثانیه` : null);
  const failed = item.status === "failed" || item.status === "interrupted";

  // RTL: the left arrow moves forward, the right arrow moves back.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLElement && event.target.closest("input, textarea, video, audio")) return;
      if (event.key === "ArrowLeft" && next) onNavigate(next);
      if (event.key === "ArrowRight" && previous) onNavigate(previous);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, previous, onNavigate]);

  async function copy(text: string) {
    try {
      await copyText(text);
      toast.success("کپی شد.");
    } catch {
      toast.error("کپی ناموفق بود.");
    }
  }

  async function retry() {
    setIsRetrying(true);
    try {
      await retryStudioItem(item);
      close();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تلاش دوباره ناموفق بود.");
    } finally {
      setIsRetrying(false);
    }
  }

  async function correct() {
    if (!item.text || !defaultModelRef) return;
    setIsCorrecting(true);
    try {
      const correctedText = await requestTranscriptCorrection({
        text: item.text,
        prompt: DEFAULT_CORRECTION_PROMPT,
        model: defaultModelRef,
      });
      await window.desktop.studio.updateTranscript(item.id, { correctedText });
      toast.success("متن اصلاح شد.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "اصلاح متن ناموفق بود.");
    } finally {
      setIsCorrecting(false);
    }
  }

  function reuse() {
    const modelKey = studioModelKey(item.provider, item.modelId);
    sendDraft(
      item.kind === "speech"
        ? { tab: "speech", text: item.prompt }
        : item.kind === "video"
          ? { tab: "video", prompt: item.prompt, modelKey, styleId: styleId ?? undefined }
          : {
              tab: "image",
              prompt: item.prompt,
              modelKey,
              styleId: styleId ?? undefined,
              aspectRatio: typeof item.params.aspectRatio === "string" ? item.params.aspectRatio : undefined,
            }
    );
    close();
  }

  return (
    <DialogContent
      className={
        isVisual
          ? "h-[min(90vh,60rem)] max-w-[calc(100%-2rem)] gap-0 overflow-hidden p-0 sm:max-w-[min(90rem,calc(100%-4rem))] md:grid-cols-[minmax(0,1fr)_21rem]"
          : "max-h-[88vh] gap-0 overflow-hidden p-0 sm:max-w-2xl"
      }
    >
      {isVisual ? (
        <div className="relative hidden min-h-0 items-center justify-center bg-muted/50 p-8 md:flex" dir="ltr">
          {item.hasMedia ? (
            <MediaStage item={item} />
          ) : (
            <p className="text-sm text-muted-foreground" dir="rtl">
              {isStudioItemBusy(item) ? "در حال ساخت…" : item.error ?? "فایلی وجود ندارد."}
            </p>
          )}
          {next ? (
            <Button
              type="button"
              variant="secondary"
              size="icon"
              className="absolute left-4 top-1/2 -translate-y-1/2 rounded-full"
              aria-label="بعدی"
              onClick={() => onNavigate(next)}
            >
              <ChevronLeftIcon />
            </Button>
          ) : null}
          {previous ? (
            <Button
              type="button"
              variant="secondary"
              size="icon"
              className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full"
              aria-label="قبلی"
              onClick={() => onNavigate(previous)}
            >
              <ChevronRightIcon />
            </Button>
          ) : null}
          {siblings.length > 1 && index >= 0 ? (
            <span className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-background/80 px-2.5 py-0.5 text-[11px] tabular-nums text-muted-foreground" dir="rtl">
              {(index + 1).toLocaleString("fa-IR")} از {siblings.length.toLocaleString("fa-IR")}
            </span>
          ) : null}
        </div>
      ) : null}

      <div dir="rtl" className="flex min-h-0 flex-col overflow-y-auto border-border/60 md:border-s">
        <div className="flex flex-col gap-1 border-b border-border/60 p-5 pe-12">
          <div className="flex items-center gap-2">
            <Badge variant="secondary">{STUDIO_KIND_LABELS[item.kind]}</Badge>
            {failed ? <Badge variant="destructive">ناموفق</Badge> : null}
          </div>
          <DialogTitle className="mt-1 line-clamp-2 text-[15px] leading-7" dir="auto">
            {item.title}
          </DialogTitle>
          <DialogDescription className="text-xs">{formatDate(item.createdAt)}</DialogDescription>
        </div>

        <div className="flex flex-col gap-5 p-5">
          {isVisual && item.hasMedia ? (
            <div className="overflow-hidden rounded-2xl bg-muted md:hidden">
              <MediaStage item={item} />
            </div>
          ) : null}

          {(item.kind === "speech" || item.kind === "transcript") && item.hasMedia ? (
            <StudioAudioPlayer src={studioMediaUrl(item)} size="lg" />
          ) : null}

          {item.kind === "transcript" && item.text ? (
            item.correctedText ? (
              <Tabs defaultValue="corrected" dir="rtl">
                <TabsList>
                  <TabsTrigger value="corrected">اصلاح‌شده</TabsTrigger>
                  <TabsTrigger value="raw">متن خام</TabsTrigger>
                </TabsList>
                <TabsContent value="corrected">
                  <TextBlock text={item.correctedText} />
                </TabsContent>
                <TabsContent value="raw">
                  <TextBlock text={item.text} />
                </TabsContent>
              </Tabs>
            ) : (
              <TextBlock text={item.text} />
            )
          ) : item.prompt ? (
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">{item.kind === "speech" ? "متن" : "درخواست"}</span>
                <Button type="button" variant="ghost" size="icon-xs" aria-label="کپی" onClick={() => void copy(item.prompt)}>
                  <CopyIcon />
                </Button>
              </div>
              <p dir="auto" className="text-sm leading-7 whitespace-pre-wrap">
                {item.prompt}
              </p>
            </div>
          ) : null}

          {failed && item.error ? (
            <p className="rounded-xl bg-muted p-3 text-xs leading-6 text-destructive">{item.error}</p>
          ) : null}

          <div className="flex flex-col divide-y divide-border/60 border-y border-border/60">
            {item.modelId ? (
              <DetailRow label="مدل">
                <span dir="ltr">{item.modelId}</span>
              </DetailRow>
            ) : null}
            {item.provider === "google" ? <DetailRow label="سرویس">Google AI Studio</DetailRow> : null}
            {voice ? (
              <DetailRow label="صدا">
                <span dir="ltr" className="capitalize">{voice}</span>
              </DetailRow>
            ) : null}
            {style && style.id !== "none" ? (
              <DetailRow label={item.kind === "video" ? "حرکت دوربین" : "سبک"}>{style.label}</DetailRow>
            ) : null}
            {typeof item.params.aspectRatio === "string" ? (
              <DetailRow label="نسبت">
                <span dir="ltr">{item.params.aspectRatio}</span>
              </DetailRow>
            ) : null}
            {typeof item.params.resolution === "string" ? (
              <DetailRow label="کیفیت">
                <span dir="ltr">{item.params.resolution}</span>
              </DetailRow>
            ) : null}
            {duration ? <DetailRow label="مدت">{duration}</DetailRow> : null}
            {cost ? <DetailRow label="هزینه">{cost}</DetailRow> : null}
          </div>

          <div className="flex flex-col gap-2">
            {item.hasMedia ? (
              <div className="grid grid-cols-2 gap-2">
                <Button type="button" size="sm" onClick={() => void window.desktop.studio.saveAs(item.id)}>
                  <DownloadIcon data-icon="inline-start" />
                  ذخیره
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={() => void window.desktop.studio.reveal(item.id)}>
                  <FolderOpenIcon data-icon="inline-start" />
                  نمایش در پوشه
                </Button>
              </div>
            ) : null}

            {item.kind === "image" && item.hasMedia ? (
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    sendDraft({ tab: "video", firstFrameItem: item });
                    close();
                  }}
                >
                  <FilmIcon data-icon="inline-start" />
                  ساخت ویدیو
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    sendDraft({ tab: "image", referenceItem: item });
                    close();
                  }}
                >
                  <ImagePlusIcon data-icon="inline-start" />
                  ویرایش
                </Button>
              </div>
            ) : null}

            {item.kind === "transcript" && item.text ? (
              <div className="grid grid-cols-2 gap-2">
                <Button type="button" size="sm" variant="outline" onClick={() => void copy(item.correctedText ?? item.text ?? "")}>
                  <CopyIcon data-icon="inline-start" />
                  کپی متن
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={!defaultModelRef || isCorrecting}
                  onClick={() => void correct()}
                >
                  {isCorrecting ? <Spinner data-icon="inline-start" /> : <SparklesIcon data-icon="inline-start" />}
                  اصلاح متن
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="col-span-2"
                  onClick={() => {
                    sendDraft({ tab: "speech", text: item.correctedText ?? item.text ?? "" });
                    close();
                  }}
                >
                  تبدیل این متن به صدا
                </Button>
              </div>
            ) : null}

            <div className="flex items-center gap-1 pt-1">
              {item.kind !== "transcript" && item.prompt ? (
                <Button type="button" size="sm" variant="ghost" onClick={reuse}>
                  <PencilLineIcon data-icon="inline-start" />
                  استفاده دوباره
                </Button>
              ) : null}
              {failed && item.kind !== "transcript" ? (
                <Button type="button" size="sm" variant="ghost" disabled={isRetrying} onClick={() => void retry()}>
                  {isRetrying ? <Spinner data-icon="inline-start" /> : <RotateCcwIcon data-icon="inline-start" />}
                  تلاش دوباره
                </Button>
              ) : null}
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="ms-auto text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={() => void window.desktop.studio.delete(item.id).then(close)}
              >
                <Trash2Icon data-icon="inline-start" />
                حذف
              </Button>
            </div>
          </div>
        </div>
      </div>
    </DialogContent>
  );
}
