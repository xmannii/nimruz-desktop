"use client";

import { studioModelKey, useStudio } from "@/components/studio/studio-context";
import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Spinner } from "@/components/ui/spinner";
import { copyText, regenerateStudioItem, retryStudioItem } from "@/lib/studio/actions";
import { isStudioItemBusy, studioMediaUrl } from "@/lib/studio/format";
import type { StudioItem } from "@/lib/studio/types";
import { cn } from "@/lib/utils";
import {
  AlertTriangleIcon,
  CopyIcon,
  DownloadIcon,
  FilmIcon,
  FolderOpenIcon,
  ImagePlusIcon,
  PencilLineIcon,
  PlayIcon,
  RefreshCwIcon,
  RotateCcwIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

function useElapsedSeconds(since: number, active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [active]);
  return Math.max(0, Math.floor((now - since) / 1_000));
}

function formatElapsed(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes.toLocaleString("fa-IR")}:${rest.toLocaleString("fa-IR", { minimumIntegerDigits: 2 })}`;
}

/** Shared actions for media items (tile menu and lightbox). */
export function useStudioItemActions(item: StudioItem) {
  const { sendDraft } = useStudio();
  return {
    save: () => void window.desktop.studio.saveAs(item.id),
    reveal: () => void window.desktop.studio.reveal(item.id),
    remove: () => void window.desktop.studio.delete(item.id),
    copyPrompt: async () => {
      try {
        await copyText(item.prompt);
        toast.success("متن درخواست کپی شد.");
      } catch {
        toast.error("کپی ناموفق بود.");
      }
    },
    reuse: () => {
      const modelKey = studioModelKey(item.provider, item.modelId);
      const styleId = typeof item.params.style === "string" ? item.params.style : undefined;
      sendDraft(
        item.kind === "video"
          ? { tab: "video", prompt: item.prompt, modelKey, styleId }
          : {
              tab: "image",
              prompt: item.prompt,
              modelKey,
              styleId,
              aspectRatio: typeof item.params.aspectRatio === "string" ? item.params.aspectRatio : undefined,
            }
      );
    },
    regenerate: async () => {
      try {
        await regenerateStudioItem(item);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "ساخت دوباره ناموفق بود.");
      }
    },
    animate: () => sendDraft({ tab: "video", firstFrameItem: item }),
    useAsReference: () => sendDraft({ tab: "image", referenceItem: item }),
  };
}

export function StudioMediaTile({
  item,
  siblings,
}: {
  item: StudioItem;
  siblings?: StudioItem[];
}) {
  const { openItem } = useStudio();
  const actions = useStudioItemActions(item);
  const busy = isStudioItemBusy(item);
  const elapsed = useElapsedSeconds(item.createdAt, busy);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isRetrying, setIsRetrying] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const failed = item.status === "failed" || item.status === "interrupted";
  const ready = item.status === "done" && item.hasMedia;

  async function retry() {
    setIsRetrying(true);
    try {
      await retryStudioItem(item);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تلاش دوباره ناموفق بود.");
    } finally {
      setIsRetrying(false);
    }
  }

  const tile = (
    <div
      className={cn(
        "group/tile relative w-full overflow-hidden rounded-xl bg-muted",
        item.kind === "video" ? "aspect-video" : "aspect-square"
      )}
    >
      {ready ? (
        <button
          type="button"
          className="absolute inset-0 size-full cursor-zoom-in focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          aria-label={`نمایش: ${item.title}`}
          onClick={() => openItem(item, siblings)}
          onMouseEnter={() => void videoRef.current?.play().catch(() => undefined)}
          onMouseLeave={() => {
            const video = videoRef.current;
            if (!video) return;
            video.pause();
            video.currentTime = 0;
          }}
        >
          {item.kind === "video" ? (
            <>
              <video
                ref={videoRef}
                src={studioMediaUrl(item)}
                muted
                loop
                playsInline
                preload="metadata"
                className="size-full object-cover"
              />
              <span className="absolute start-2 bottom-2 flex size-7 items-center justify-center rounded-full bg-black/50 text-white transition-opacity group-hover/tile:opacity-0">
                <PlayIcon className="size-3 translate-x-px fill-current" />
              </span>
            </>
          ) : (
            <img
              src={studioMediaUrl(item)}
              alt={item.prompt}
              loading="lazy"
              decoding="async"
              onLoad={() => setLoaded(true)}
              className={cn("size-full object-cover transition-opacity duration-200", loaded ? "opacity-100" : "opacity-0")}
            />
          )}
          <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent px-2.5 pt-6 pb-2 text-start opacity-0 transition-opacity group-hover/tile:opacity-100">
            <span dir="auto" className="line-clamp-2 text-[11px] leading-[1.15rem] text-white">
              {item.prompt}
            </span>
          </span>
        </button>
      ) : busy ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 p-3 text-center">
          <Spinner className="size-4 text-muted-foreground" />
          <span className="text-[11px] tabular-nums text-muted-foreground">{formatElapsed(elapsed)}</span>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className="absolute end-1.5 top-1.5 rounded-full opacity-0 transition-opacity group-hover/tile:opacity-100 focus-visible:opacity-100"
            aria-label="لغو ساخت"
            onClick={() => void window.desktop.studio.cancel(item.id)}
          >
            <XIcon />
          </Button>
        </div>
      ) : failed ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-3 text-center">
          <AlertTriangleIcon className="size-4 text-destructive" />
          <p className="line-clamp-2 text-[11px] leading-[1.15rem] text-muted-foreground" title={item.error ?? undefined}>
            {item.error ?? "ساخت ناموفق بود."}
          </p>
          <div className="flex gap-0.5">
            <Button
              type="button"
              size="icon-xs"
              variant="ghost"
              className="rounded-full"
              aria-label="تلاش دوباره"
              title="تلاش دوباره"
              disabled={isRetrying}
              onClick={() => void retry()}
            >
              {isRetrying ? <Spinner /> : <RotateCcwIcon />}
            </Button>
            <Button
              type="button"
              size="icon-xs"
              variant="ghost"
              className="rounded-full"
              aria-label="حذف"
              title="حذف"
              onClick={actions.remove}
            >
              <Trash2Icon />
            </Button>
          </div>
        </div>
      ) : null}

      {ready ? (
        <div className="absolute end-1.5 top-1.5 flex gap-1 opacity-0 transition-opacity group-hover/tile:opacity-100 group-focus-within/tile:opacity-100">
          <Button
            type="button"
            size="icon-xs"
            variant="secondary"
            className="size-7 rounded-full bg-background/90 shadow-sm hover:bg-background"
            aria-label="ذخیره فایل"
            title="ذخیره"
            onClick={actions.save}
          >
            <DownloadIcon />
          </Button>
        </div>
      ) : null}
    </div>
  );

  return (
    <ContextMenu>
      <ContextMenuTrigger render={<div className="w-full" />}>{tile}</ContextMenuTrigger>
      <ContextMenuContent dir="rtl" className="min-w-52">
        {ready ? (
          <>
            <ContextMenuItem onClick={actions.save}>
              <DownloadIcon />
              ذخیره…
            </ContextMenuItem>
            <ContextMenuItem onClick={actions.reveal}>
              <FolderOpenIcon />
              نمایش در پوشه
            </ContextMenuItem>
            <ContextMenuSeparator />
          </>
        ) : null}
        <ContextMenuItem onClick={actions.reuse}>
          <PencilLineIcon />
          استفاده دوباره از درخواست
        </ContextMenuItem>
        <ContextMenuItem onClick={() => void actions.regenerate()}>
          <RefreshCwIcon />
          ساخت دوباره
        </ContextMenuItem>
        <ContextMenuItem onClick={() => void actions.copyPrompt()}>
          <CopyIcon />
          کپی متن درخواست
        </ContextMenuItem>
        {ready && item.kind === "image" ? (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem onClick={actions.animate}>
              <FilmIcon />
              ساخت ویدیو از این تصویر
            </ContextMenuItem>
            <ContextMenuItem onClick={actions.useAsReference}>
              <ImagePlusIcon />
              ویرایش با این تصویر
            </ContextMenuItem>
          </>
        ) : null}
        <ContextMenuSeparator />
        <ContextMenuItem variant="destructive" onClick={actions.remove}>
          <Trash2Icon />
          حذف
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
