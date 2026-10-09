"use client";

import { useAppShell } from "@/components/app-shell-context";
import { StudioAudioPlayer } from "@/components/studio/studio-audio-player";
import { useStudio } from "@/components/studio/studio-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
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
import type { StudioItem } from "@/lib/studio/types";
import { DEFAULT_CORRECTION_PROMPT } from "@/lib/speech/correction";
import { requestTranscriptCorrection } from "@/lib/speech/request-correction";
import {
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
import { useState, type ReactNode } from "react";
import { toast } from "sonner";

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1.5 text-xs">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 text-end font-medium break-words">{children}</span>
    </div>
  );
}

function formatDate(timestamp: number) {
  return new Intl.DateTimeFormat("fa-IR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(timestamp);
}

function TextBlock({ text }: { text: string }) {
  return (
    <div
      dir="auto"
      className="max-h-[50vh] overflow-y-auto rounded-2xl bg-muted/60 p-4 text-sm leading-8 whitespace-pre-wrap"
    >
      {text}
    </div>
  );
}

function MediaStage({ item }: { item: StudioItem }) {
  if (item.kind === "image" && item.hasMedia) {
    return (
      <img
        src={studioMediaUrl(item)}
        alt={item.prompt}
        className="max-h-full max-w-full rounded-lg object-contain shadow-2xl"
      />
    );
  }
  if (item.kind === "video" && item.hasMedia) {
    return (
      <video
        src={studioMediaUrl(item)}
        controls
        autoPlay
        loop
        playsInline
        className="max-h-full max-w-full rounded-lg shadow-2xl"
      />
    );
  }
  return null;
}

export function StudioItemViewer({
  item,
  onOpenChange,
}: {
  item: StudioItem | null;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={Boolean(item)} onOpenChange={onOpenChange}>
      {item ? <ViewerContent key={item.id} item={item} close={() => onOpenChange(false)} /> : null}
    </Dialog>
  );
}

function ViewerContent({ item, close }: { item: StudioItem; close: () => void }) {
  const { sendDraft } = useStudio();
  const { defaultModelRef } = useAppShell();
  const [isCorrecting, setIsCorrecting] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const isVisual = item.kind === "image" || item.kind === "video";
  const voice = typeof item.params.voice === "string" ? item.params.voice : null;
  const cost = formatStudioCost(item.cost);
  const duration =
    formatStudioDuration(item.durationSeconds) ??
    (typeof item.params.duration === "number"
      ? `${item.params.duration.toLocaleString("fa-IR")} ثانیه`
      : null);

  async function copy(text: string, message: string) {
    try {
      await copyText(text);
      toast.success(message);
    } catch {
      toast.error("کپی ناموفق بود.");
    }
  }

  async function remove() {
    await window.desktop.studio.delete(item.id);
    close();
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

  const failed = item.status === "failed" || item.status === "interrupted";

  return (
    <DialogContent
      className={
        isVisual
          ? "h-[min(88vh,56rem)] max-w-[calc(100%-2rem)] gap-0 overflow-hidden p-0 sm:max-w-6xl md:grid-cols-[minmax(0,1fr)_20rem]"
          : "max-h-[88vh] gap-0 overflow-hidden p-0 sm:max-w-2xl"
      }
    >
      {isVisual ? (
        <div className="relative hidden min-h-0 items-center justify-center bg-[radial-gradient(circle_at_center,color-mix(in_oklab,var(--foreground)_6%,transparent),transparent_70%)] bg-muted/40 p-6 md:flex">
          {item.hasMedia ? (
            <MediaStage item={item} />
          ) : (
            <p className="text-sm text-muted-foreground">
              {isStudioItemBusy(item) ? "در حال ساخت…" : item.error ?? "فایلی وجود ندارد."}
            </p>
          )}
        </div>
      ) : null}

      <div dir="rtl" className="flex min-h-0 flex-col overflow-y-auto">
        <div className="flex flex-col gap-1 border-b border-border/60 p-5 pe-12">
          <div className="flex items-center gap-2">
            <Badge variant="secondary">{STUDIO_KIND_LABELS[item.kind]}</Badge>
            {failed ? <Badge variant="destructive">ناموفق</Badge> : null}
          </div>
          <DialogTitle className="mt-1 line-clamp-2 text-base leading-7" dir="auto">
            {item.title}
          </DialogTitle>
          <DialogDescription className="text-xs">{formatDate(item.createdAt)}</DialogDescription>
        </div>

        <div className="flex flex-col gap-4 p-5">
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
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">
                  {item.kind === "speech" ? "متن" : "درخواست"}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label="کپی"
                  onClick={() => void copy(item.prompt, "متن کپی شد.")}
                >
                  <CopyIcon />
                </Button>
              </div>
              <p dir="auto" className="rounded-2xl bg-muted/60 p-3.5 text-sm leading-7 whitespace-pre-wrap">
                {item.prompt}
              </p>
            </div>
          ) : null}

          {failed && item.error ? (
            <p className="rounded-2xl bg-destructive/10 p-3 text-xs leading-6 text-destructive">
              {item.error}
            </p>
          ) : null}

          <div className="flex flex-col divide-y divide-border/60">
            {item.modelId ? (
              <DetailRow label="مدل">
                <span dir="ltr">{item.modelId}</span>
              </DetailRow>
            ) : null}
            {voice ? (
              <DetailRow label="صدا">
                <span dir="ltr">{voice}</span>
              </DetailRow>
            ) : null}
            {typeof item.params.aspectRatio === "string" ? (
              <DetailRow label="نسبت تصویر">
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

          <Separator />

          <div className="flex flex-wrap gap-2">
            {item.hasMedia ? (
              <>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => void window.desktop.studio.saveAs(item.id)}
                >
                  <DownloadIcon data-icon="inline-start" />
                  ذخیره
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => void window.desktop.studio.reveal(item.id)}
                >
                  <FolderOpenIcon data-icon="inline-start" />
                  نمایش در پوشه
                </Button>
              </>
            ) : null}

            {item.kind === "transcript" && item.text ? (
              <>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    void copy(item.correctedText ?? item.text ?? "", "متن کپی شد.")
                  }
                >
                  <CopyIcon data-icon="inline-start" />
                  کپی متن
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={!defaultModelRef || isCorrecting}
                  onClick={() => void correct()}
                >
                  {isCorrecting ? <Spinner data-icon="inline-start" /> : <SparklesIcon data-icon="inline-start" />}
                  اصلاح با هوش مصنوعی
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    sendDraft({ tab: "speech", text: item.correctedText ?? item.text ?? "" });
                    close();
                  }}
                >
                  <PencilLineIcon data-icon="inline-start" />
                  تبدیل به صدا
                </Button>
              </>
            ) : null}

            {item.kind === "image" && item.hasMedia ? (
              <>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    sendDraft({ tab: "video", firstFrameItem: item, prompt: "" });
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
                  ویرایش با مرجع
                </Button>
              </>
            ) : null}

            {item.kind !== "transcript" && item.prompt ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  sendDraft(
                    item.kind === "speech"
                      ? { tab: "speech", text: item.prompt }
                      : item.kind === "video"
                        ? { tab: "video", prompt: item.prompt, modelId: item.modelId }
                        : { tab: "image", prompt: item.prompt, modelId: item.modelId }
                  );
                  close();
                }}
              >
                <PencilLineIcon data-icon="inline-start" />
                استفاده دوباره
              </Button>
            ) : null}

            {failed && item.kind !== "transcript" ? (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={isRetrying}
                onClick={() => void retry()}
              >
                {isRetrying ? <Spinner data-icon="inline-start" /> : <RotateCcwIcon data-icon="inline-start" />}
                تلاش دوباره
              </Button>
            ) : null}

            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="ms-auto text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => void remove()}
            >
              <Trash2Icon data-icon="inline-start" />
              حذف
            </Button>
          </div>
        </div>
      </div>
    </DialogContent>
  );
}
