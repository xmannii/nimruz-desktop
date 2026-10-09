"use client";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { retryStudioItem } from "@/lib/studio/actions";
import {
  isStudioItemBusy,
  shortModelName,
  studioMediaUrl,
} from "@/lib/studio/format";
import type { StudioItem } from "@/lib/studio/types";
import { cn } from "@/lib/utils";
import {
  AlertTriangleIcon,
  DownloadIcon,
  PlayIcon,
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
  return minutes > 0
    ? `${minutes.toLocaleString("fa-IR")}:${rest.toLocaleString("fa-IR", { minimumIntegerDigits: 2 })}`
    : `${rest.toLocaleString("fa-IR")} ثانیه`;
}

export function StudioMediaTile({
  item,
  onOpen,
  className,
}: {
  item: StudioItem;
  onOpen: (item: StudioItem) => void;
  className?: string;
}) {
  const busy = isStudioItemBusy(item);
  const elapsed = useElapsedSeconds(item.createdAt, busy);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isRetrying, setIsRetrying] = useState(false);
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

  return (
    <div
      className={cn(
        "group/tile relative overflow-hidden rounded-2xl bg-muted ring-1 ring-foreground/5",
        item.kind === "video" ? "aspect-video" : "aspect-square",
        className
      )}
    >
      {ready ? (
        <button
          type="button"
          className="absolute inset-0 size-full cursor-zoom-in focus-visible:outline-none"
          aria-label={`نمایش: ${item.title}`}
          onClick={() => onOpen(item)}
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
              <span className="absolute start-2 top-2 flex size-7 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-sm transition-opacity group-hover/tile:opacity-0">
                <PlayIcon className="size-3.5 translate-x-px" />
              </span>
            </>
          ) : (
            <img
              src={studioMediaUrl(item)}
              alt={item.prompt}
              loading="lazy"
              decoding="async"
              className="size-full object-cover transition-transform duration-500 group-hover/tile:scale-[1.03]"
            />
          )}
          <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 via-black/25 to-transparent p-3 pt-10 text-start opacity-0 transition-opacity duration-200 group-hover/tile:opacity-100 group-focus-within/tile:opacity-100">
            <span className="line-clamp-2 text-xs leading-5 text-white" dir="auto">
              {item.prompt}
            </span>
            <span className="mt-1 block truncate text-[10px] text-white/70" dir="ltr">
              {shortModelName(item.modelId.split("/").at(-1) ?? item.modelId)}
            </span>
          </span>
        </button>
      ) : busy ? (
        <div className="studio-shimmer absolute inset-0 flex flex-col items-center justify-center gap-3 p-4 text-center">
          <Spinner className="size-5 text-muted-foreground" />
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-foreground/80">
              {item.status === "pending" ? "در صف ساخت…" : "در حال ساخت…"}
            </span>
            <span className="text-[11px] tabular-nums text-muted-foreground">
              {formatElapsed(elapsed)}
            </span>
          </div>
          <p className="line-clamp-2 max-w-[90%] text-[11px] leading-5 text-muted-foreground" dir="auto">
            {item.prompt}
          </p>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="absolute end-2 top-2 rounded-full opacity-0 transition-opacity group-hover/tile:opacity-100 focus-visible:opacity-100"
            aria-label="لغو ساخت"
            onClick={() => void window.desktop.studio.cancel(item.id)}
          >
            <XIcon />
          </Button>
        </div>
      ) : failed ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-4 text-center">
          <span className="flex size-9 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <AlertTriangleIcon className="size-4" />
          </span>
          <p className="line-clamp-3 text-xs leading-5 text-muted-foreground">
            {item.error ?? "ساخت ناموفق بود."}
          </p>
          <div className="flex gap-1.5">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="rounded-full"
              disabled={isRetrying}
              onClick={() => void retry()}
            >
              {isRetrying ? <Spinner data-icon="inline-start" /> : <RotateCcwIcon data-icon="inline-start" />}
              دوباره
            </Button>
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              className="rounded-full"
              aria-label="حذف"
              onClick={() => void window.desktop.studio.delete(item.id)}
            >
              <Trash2Icon />
            </Button>
          </div>
        </div>
      ) : null}

      {ready ? (
        <Button
          type="button"
          size="icon-sm"
          variant="secondary"
          className="absolute end-2 top-2 rounded-full bg-background/80 opacity-0 shadow-sm backdrop-blur transition-opacity group-hover/tile:opacity-100 focus-visible:opacity-100"
          aria-label="ذخیره فایل"
          onClick={() => void window.desktop.studio.saveAs(item.id)}
        >
          <DownloadIcon />
        </Button>
      ) : null}
    </div>
  );
}
