"use client";

import { useStudio } from "@/components/studio/studio-context";
import { StudioMediaTile } from "@/components/studio/studio-media-tile";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useStudioItems } from "@/hooks/use-studio-items";
import { copyText, regenerateStudioItem } from "@/lib/studio/actions";
import {
  formatDayLabel,
  formatRelativeTime,
  groupStudioRuns,
  isSameDay,
  shortModelName,
  type StudioRun,
} from "@/lib/studio/format";
import { findPreset, IMAGE_STYLES, VIDEO_CAMERA_MOVES } from "@/lib/studio/presets";
import type { StudioItem, StudioKind } from "@/lib/studio/types";
import { cn } from "@/lib/utils";
import {
  ArrowDownIcon,
  CopyIcon,
  PencilLineIcon,
  RefreshCwIcon,
  ImageUpIcon,
} from "lucide-react";
import {
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type ReactNode,
} from "react";
import { toast } from "sonner";

function Chip({ children, ltr = false }: { children: ReactNode; ltr?: boolean }) {
  return (
    <span
      dir={ltr ? "ltr" : undefined}
      className="inline-flex h-5 items-center rounded-full bg-muted px-2 text-[10.5px] font-medium text-muted-foreground"
    >
      {children}
    </span>
  );
}

function RunCard({
  run,
  onReuse,
}: {
  run: StudioRun;
  onReuse: (item: StudioItem) => void;
}) {
  const first = run.items[0];
  const [isRegenerating, setIsRegenerating] = useState(false);
  const styleId = typeof first.params.style === "string" ? first.params.style : null;
  const style = styleId
    ? findPreset(first.kind === "video" ? VIDEO_CAMERA_MOVES : IMAGE_STYLES, styleId)
    : null;
  const ratio = typeof first.params.aspectRatio === "string" ? first.params.aspectRatio : null;
  const duration = typeof first.params.duration === "number" ? first.params.duration : null;
  const hasReference =
    Boolean(first.parentId) || Number(first.params.referenceCount ?? 0) > 0 || first.params.hasFirstFrame === true;

  async function regenerate() {
    setIsRegenerating(true);
    try {
      await regenerateStudioItem(first, run.items.length);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "ساخت دوباره ناموفق بود.");
    } finally {
      setIsRegenerating(false);
    }
  }

  return (
    <article className="group/run flex flex-col gap-3">
      <header className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p dir="auto" className="line-clamp-2 text-[13.5px] leading-6 text-foreground/90" title={first.prompt}>
            {first.prompt}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <Chip ltr>{shortModelName(first.modelId.split("/").at(-1) ?? first.modelId)}</Chip>
            {first.provider === "google" ? <Chip ltr>Google</Chip> : null}
            {ratio ? <Chip ltr>{ratio}</Chip> : null}
            {duration ? <Chip>{duration.toLocaleString("fa-IR")} ثانیه</Chip> : null}
            {style && style.id !== "none" ? <Chip>{style.label}</Chip> : null}
            {hasReference ? (
              <span className="inline-flex h-5 items-center gap-1 rounded-full bg-muted px-2 text-[10.5px] text-muted-foreground">
                <ImageUpIcon className="size-3" />
                با تصویر
              </span>
            ) : null}
            <time
              dateTime={new Date(run.createdAt).toISOString()}
              className="text-[11px] text-muted-foreground/80"
            >
              {formatRelativeTime(run.createdAt)}
            </time>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover/run:opacity-100 group-focus-within/run:opacity-100">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="rounded-full"
            aria-label="استفاده دوباره از درخواست"
            title="استفاده دوباره"
            onClick={() => onReuse(first)}
          >
            <PencilLineIcon />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="rounded-full"
            aria-label="ساخت دوباره با همین تنظیمات"
            title="ساخت دوباره"
            disabled={isRegenerating}
            onClick={() => void regenerate()}
          >
            <RefreshCwIcon className={cn(isRegenerating && "animate-spin")} />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="rounded-full"
            aria-label="کپی متن درخواست"
            title="کپی"
            onClick={async () => {
              try {
                await copyText(first.prompt);
                toast.success("متن درخواست کپی شد.");
              } catch {
                toast.error("کپی ناموفق بود.");
              }
            }}
          >
            <CopyIcon />
          </Button>
        </div>
      </header>
      <div className="flex flex-wrap gap-2.5">
        {run.items.map((item) => (
          <StudioMediaTile key={item.id} item={item} siblings={run.items} />
        ))}
      </div>
    </article>
  );
}

/**
 * Chat-like feed of generations with the composer docked underneath.
 * Newest runs sit nearest the prompt, so results appear where you look.
 */
export function StudioFeed({
  kind,
  composer,
  empty,
  onReuse,
  onDropFiles,
}: {
  kind: Extract<StudioKind, "image" | "video">;
  composer: ReactNode;
  empty: ReactNode;
  onReuse: (item: StudioItem) => void;
  onDropFiles?: (files: File[]) => void;
}) {
  const { view } = useStudio();
  const { items, isLoading, hasMore, loadMore } = useStudioItems({ kind });
  const runs = useMemo(() => groupStudioRuns(items), [items]);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const pinnedRef = useRef(true);
  const lastRunKey = useRef<string | null>(null);
  const restoreOffset = useRef<number | null>(null);
  const [showJump, setShowJump] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "auto") => {
    const scroller = scrollerRef.current;
    if (scroller) scroller.scrollTo({ top: scroller.scrollHeight, behavior });
  }, []);

  // Feed view: keep the newest run in view as results arrive.
  useLayoutEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller || view !== "feed") return;
    if (restoreOffset.current !== null) {
      scroller.scrollTop = scroller.scrollHeight - restoreOffset.current;
      restoreOffset.current = null;
      return;
    }
    const newest = runs.at(-1)?.key ?? null;
    const isNewRun = newest !== lastRunKey.current;
    lastRunKey.current = newest;
    if (pinnedRef.current || isNewRun) scrollToBottom(isNewRun && lastRunKey.current ? "smooth" : "auto");
  }, [runs, view, scrollToBottom]);

  useEffect(() => {
    if (view === "feed") requestAnimationFrame(() => scrollToBottom());
    else scrollerRef.current?.scrollTo({ top: 0 });
  }, [view, scrollToBottom]);

  function handleScroll() {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const distance = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;
    pinnedRef.current = distance < 120;
    setShowJump(view === "feed" && distance > 600);
  }

  function loadOlder() {
    const scroller = scrollerRef.current;
    if (scroller && view === "feed") restoreOffset.current = scroller.scrollHeight - scroller.scrollTop;
    loadMore();
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragging(false);
    if (onDropFiles) onDropFiles(Array.from(event.dataTransfer.files));
  }

  return (
    <div
      className="relative flex h-full min-h-0 flex-col"
      onDragEnter={(event) => {
        if (onDropFiles && Array.from(event.dataTransfer.types).includes("Files")) setIsDragging(true);
      }}
      onDragOver={(event) => {
        if (onDropFiles) event.preventDefault();
      }}
      onDragLeave={(event) => {
        if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) {
          setIsDragging(false);
        }
      }}
      onDrop={handleDrop}
    >
      <div
        ref={scrollerRef}
        onScroll={handleScroll}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-gutter:stable]"
      >
        <div className="mx-auto flex min-h-full w-full max-w-5xl flex-col px-4 pt-6 pb-8 sm:px-8">
          {isLoading && items.length === 0 ? (
            <div className="mt-auto flex flex-col gap-3">
              <Skeleton className="h-4 w-2/3 rounded-full" />
              <div className="flex gap-2.5">
                <Skeleton className="h-56 w-56 rounded-2xl" />
                <Skeleton className="h-56 w-56 rounded-2xl" />
              </div>
            </div>
          ) : items.length === 0 ? (
            <div className="my-auto">{empty}</div>
          ) : view === "grid" ? (
            <div
              className={cn(
                "grid gap-2",
                kind === "video"
                  ? "grid-cols-[repeat(auto-fill,minmax(15rem,1fr))]"
                  : "grid-cols-[repeat(auto-fill,minmax(10rem,1fr))]"
              )}
            >
              {items.map((item) => (
                <StudioMediaTile key={item.id} item={item} siblings={items} layout="grid" />
              ))}
            </div>
          ) : (
            <div className="mt-auto flex flex-col gap-9">
              {hasMore ? (
                <Button type="button" variant="ghost" size="sm" className="self-center rounded-full text-muted-foreground" onClick={loadOlder}>
                  نمایش ساخته‌های قدیمی‌تر
                </Button>
              ) : null}
              {runs.map((run, index) => (
                <Fragment key={run.key}>
                  {index === 0 || !isSameDay(runs[index - 1].createdAt, run.createdAt) ? (
                    <div className="flex items-center gap-3 text-[11px] font-medium text-muted-foreground/80">
                      <span className="h-px flex-1 bg-border/70" />
                      {formatDayLabel(run.createdAt)}
                      <span className="h-px flex-1 bg-border/70" />
                    </div>
                  ) : null}
                  <RunCard run={run} onReuse={onReuse} />
                </Fragment>
              ))}
            </div>
          )}
          {view === "grid" && hasMore ? (
            <Button type="button" variant="ghost" size="sm" className="mt-6 self-center rounded-full" onClick={loadOlder}>
              موارد بیشتر
            </Button>
          ) : null}
        </div>
      </div>

      <div className="relative shrink-0 px-4 pb-3 sm:px-8">
        <div className="pointer-events-none absolute inset-x-0 -top-10 h-10 bg-gradient-to-t from-background to-transparent" />
        {showJump ? (
          <Button
            type="button"
            size="icon-sm"
            variant="secondary"
            className="absolute -top-12 start-1/2 z-10 -translate-x-1/2 rounded-full shadow-md rtl:translate-x-1/2"
            aria-label="رفتن به جدیدترین"
            onClick={() => scrollToBottom("smooth")}
          >
            <ArrowDownIcon />
          </Button>
        ) : null}
        {composer}
      </div>

      {isDragging ? (
        <div className="pointer-events-none absolute inset-3 z-20 flex items-center justify-center rounded-3xl border-2 border-dashed border-primary/60 bg-background/80 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-2 text-center">
            <ImageUpIcon className="size-8 text-primary" />
            <p className="font-medium">تصویر را اینجا رها کنید</p>
            <p className="text-xs text-muted-foreground">
              {kind === "video" ? "به عنوان فریم آغازین ویدیو" : "به عنوان تصویر مرجع"}
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** Quiet first-run state: one line on what to do. */
export function StudioEmptyState({
  icon,
  title,
  description,
}: {
  icon: ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="mx-auto flex max-w-sm flex-col items-center gap-2 py-10 text-center">
      <span className="mb-1 text-muted-foreground/70 [&_svg]:size-6">{icon}</span>
      <h2 className="text-[15px] font-medium">{title}</h2>
      <p className="text-[13px] leading-6 text-muted-foreground">{description}</p>
    </div>
  );
}
