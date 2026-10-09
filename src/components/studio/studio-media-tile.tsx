"use client";

import { useStudio } from "@/components/studio/studio-context";
import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Spinner } from "@/components/ui/spinner";
import { copyText, retryStudioItem } from "@/lib/studio/actions";
import {
  isStudioItemBusy,
  parseAspectRatio,
  studioMediaUrl,
} from "@/lib/studio/format";
import type { StudioItem } from "@/lib/studio/types";
import { cn } from "@/lib/utils";
import {
  AlertTriangleIcon,
  CopyIcon,
  DownloadIcon,
  FilmIcon,
  FolderOpenIcon,
  ImagePlusIcon,
  PlayIcon,
  RotateCcwIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties } from "react";
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
  return `${minutes.toLocaleString("fa-IR")}:${rest.toLocaleString("fa-IR", {
    minimumIntegerDigits: 2,
  })}`;
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
    animate: () => sendDraft({ tab: "video", firstFrameItem: item }),
    useAsReference: () => sendDraft({ tab: "image", referenceItem: item }),
  };
}

export function StudioMediaTile({
  item,
  siblings,
  layout = "feed",
}: {
  item: StudioItem;
  siblings?: StudioItem[];
  layout?: "feed" | "grid";
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
  const ratio =
    parseAspectRatio(item.params.aspectRatio) ?? (item.kind === "video" ? 16 / 9 : 1);

  const sizing: CSSProperties =
    layout === "feed" ? { aspectRatio: ratio } : { aspectRatio: item.kind === "video" ? 16 / 9 : 1 };

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
        "group/tile relative overflow-hidden rounded-2xl bg-muted ring-1 ring-foreground/5",
        layout === "feed" ? "h-[clamp(12rem,32vh,20rem)] max-w-full" : "w-full"
      )}
      style={sizing}
    >
      {ready ? (
        <button
          type="button"
          className="absolute inset-0 size-full cursor-zoom-in focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-ring/60"
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
                onLoadedData={() => setLoaded(true)}
                className="size-full object-cover"
              />
              <span className="absolute start-2.5 bottom-2.5 flex size-8 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-md transition-opacity group-hover/tile:opacity-0">
                <PlayIcon className="size-3.5 translate-x-px fill-current" />
              </span>
            </>
          ) : (
            <img
              src={studioMediaUrl(item)}
              alt={item.prompt}
              loading="lazy"
              decoding="async"
              onLoad={() => setLoaded(true)}
              className={cn(
                "size-full object-cover transition-opacity duration-300",
                loaded ? "opacity-100" : "opacity-0"
              )}
            />
          )}
        </button>
      ) : busy ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-center">
          <Spinner className="size-5 text-muted-foreground" />
          <span className="text-xs font-medium text-foreground/80">
            {item.status === "pending" ? "در صف…" : item.kind === "video" ? "در حال ساخت ویدیو" : "در حال ساخت"}
          </span>
          <span className="text-[11px] tabular-nums text-muted-foreground">{formatElapsed(elapsed)}</span>
          {item.kind === "video" ? (
            <span className="text-[10px] text-muted-foreground/80">معمولاً ۱ تا ۴ دقیقه</span>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className="absolute end-2 top-2 rounded-full opacity-0 transition-opacity group-hover/tile:opacity-100 focus-visible:opacity-100"
            aria-label="لغو ساخت"
            onClick={() => void window.desktop.studio.cancel(item.id)}
          >
            <XIcon />
          </Button>
        </div>
      ) : failed ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2.5 p-4 text-center">
          <span className="flex size-9 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <AlertTriangleIcon className="size-4" />
          </span>
          <p className="line-clamp-3 max-w-56 text-xs leading-5 text-muted-foreground" title={item.error ?? undefined}>
            {item.error ?? "ساخت ناموفق بود."}
          </p>
          <div className="flex gap-1">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="h-7 rounded-full px-3 text-xs"
              disabled={isRetrying}
              onClick={() => void retry()}
            >
              {isRetrying ? <Spinner data-icon="inline-start" /> : <RotateCcwIcon data-icon="inline-start" />}
              دوباره
            </Button>
            <Button
              type="button"
              size="icon-xs"
              variant="ghost"
              className="size-7 rounded-full"
              aria-label="حذف"
              onClick={actions.remove}
            >
              <Trash2Icon />
            </Button>
          </div>
        </div>
      ) : null}

      {ready ? (
        <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-end gap-1 bg-gradient-to-b from-black/35 to-transparent p-2 opacity-0 transition-opacity duration-200 group-hover/tile:opacity-100 group-focus-within/tile:opacity-100">
          {item.kind === "image" ? (
            <Button
              type="button"
              size="icon-xs"
              variant="secondary"
              className="pointer-events-auto size-7 rounded-full bg-white/85 text-black shadow-sm backdrop-blur hover:bg-white"
              aria-label="ساخت ویدیو از این تصویر"
              title="ساخت ویدیو"
              onClick={actions.animate}
            >
              <FilmIcon />
            </Button>
          ) : null}
          <Button
            type="button"
            size="icon-xs"
            variant="secondary"
            className="pointer-events-auto size-7 rounded-full bg-white/85 text-black shadow-sm backdrop-blur hover:bg-white"
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
      <ContextMenuTrigger render={<div className={layout === "grid" ? "w-full" : undefined} />}>
        {tile}
      </ContextMenuTrigger>
      <ContextMenuContent dir="rtl" className="min-w-48">
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
          </>
        ) : null}
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
