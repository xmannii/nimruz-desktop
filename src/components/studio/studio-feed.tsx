"use client";

import { StudioMediaTile } from "@/components/studio/studio-media-tile";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useStudioItems } from "@/hooks/use-studio-items";
import { groupStudioItemsByDate, parseAspectRatio } from "@/lib/studio/format";
import { computeJustifiedRows } from "@/lib/studio/layout";
import type { StudioItem, StudioKind } from "@/lib/studio/types";
import { cn } from "@/lib/utils";
import { ImageUpIcon } from "lucide-react";
import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type ReactNode,
  type Ref,
} from "react";

export type StudioFeedHandle = { scrollToTop: () => void };

const GAP = 8;

/** Width of an element, kept current with a ResizeObserver. */
function useElementWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    setWidth(element.clientWidth);
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

/**
 * Rows of media at their real aspect ratios, scaled so every full row
 * spans the container (a "justified" photo layout).
 */
function JustifiedGallery({
  items,
  siblings,
  width,
  targetHeight,
  naturalRatios,
  onNaturalRatio,
}: {
  items: StudioItem[];
  siblings: StudioItem[];
  width: number;
  targetHeight: number;
  naturalRatios: Map<string, number>;
  onNaturalRatio: (id: string, ratio: number) => void;
}) {
  const rows = useMemo(() => {
    const ratios = items.map(
      (item) =>
        naturalRatios.get(item.id) ??
        parseAspectRatio(item.params.aspectRatio) ??
        (item.kind === "video" ? 16 / 9 : 1)
    );
    return computeJustifiedRows(ratios, width, { targetHeight, gap: GAP });
  }, [items, naturalRatios, width, targetHeight]);

  return (
    <div className="flex flex-col" style={{ gap: GAP }}>
      {rows.map((row, rowIndex) => (
        <div key={rowIndex} className="flex" style={{ gap: GAP, height: row.height }}>
          {row.boxes.map((box) => {
            const item = items[box.index];
            return (
              <StudioMediaTile
                key={item.id}
                item={item}
                siblings={siblings}
                size={{ width: box.width, height: box.height }}
                onNaturalRatio={onNaturalRatio}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}

/**
 * Gallery of generations, newest first and grouped by day, with the
 * composer docked underneath. New placeholders appear at the top-start
 * corner, so the view scrolls back up after each submit.
 */
export function StudioFeed({
  kind,
  composer,
  empty,
  onDropFiles,
  ref,
}: {
  kind: Extract<StudioKind, "image" | "video">;
  composer: ReactNode;
  empty: ReactNode;
  onDropFiles?: (files: File[]) => void;
  ref?: Ref<StudioFeedHandle>;
}) {
  const { items, isLoading, hasMore, loadMore } = useStudioItems({ kind });
  const scrollerRef = useRef<HTMLDivElement>(null);
  const newestId = useRef<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [contentRef, contentWidth] = useElementWidth<HTMLDivElement>();
  const [naturalRatios, setNaturalRatios] = useState<Map<string, number>>(() => new Map());
  const targetHeight = kind === "video" ? 190 : 210;

  const rememberRatio = useCallback((id: string, ratio: number) => {
    setNaturalRatios((current) => {
      const previous = current.get(id);
      if (previous !== undefined && Math.abs(previous - ratio) < 0.01) return current;
      const next = new Map(current);
      next.set(id, ratio);
      return next;
    });
  }, []);

  useImperativeHandle(ref, () => ({
    scrollToTop: () => scrollerRef.current?.scrollTo({ top: 0, behavior: "smooth" }),
  }));

  // Always open at the newest items; the browser may restore an old offset.
  useLayoutEffect(() => {
    scrollerRef.current?.scrollTo({ top: 0 });
  }, []);

  // Bring brand-new generations into view.
  useEffect(() => {
    const newest = items[0]?.id ?? null;
    if (newestId.current && newest && newest !== newestId.current) {
      scrollerRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    }
    newestId.current = newest;
  }, [items]);

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragging(false);
    if (onDropFiles) onDropFiles(Array.from(event.dataTransfer.files));
  }

  const gridClass = "grid grid-cols-[repeat(auto-fill,minmax(12rem,1fr))] gap-2";

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
      <div ref={scrollerRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="mx-auto flex min-h-full w-full max-w-6xl flex-col px-4 py-5 sm:px-6">
          <div ref={contentRef} className="flex w-full flex-1 flex-col">
            {isLoading && items.length === 0 ? (
              <div className={gridClass}>
                {Array.from({ length: kind === "video" ? 3 : 6 }, (_, index) => (
                  <Skeleton
                    key={index}
                    className={cn("rounded-xl", kind === "video" ? "aspect-video" : "aspect-square")}
                  />
                ))}
              </div>
            ) : items.length === 0 ? (
              <div className="my-auto">{empty}</div>
            ) : (
              <div className="flex flex-col gap-6">
                {groupStudioItemsByDate(items).map((group) => (
                  <section key={group.label} className="flex flex-col gap-2.5">
                    <h2 className="text-xs font-medium text-muted-foreground">{group.label}</h2>
                    <JustifiedGallery
                      items={group.items}
                      siblings={items}
                      width={contentWidth}
                      targetHeight={targetHeight}
                      naturalRatios={naturalRatios}
                      onNaturalRatio={rememberRatio}
                    />
                  </section>
                ))}
                {hasMore ? (
                  <Button type="button" variant="ghost" size="sm" className="self-center" onClick={loadMore}>
                    موارد قدیمی‌تر
                  </Button>
                ) : null}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="shrink-0 border-t border-border/60 bg-background px-4 pt-3 pb-3 sm:px-6">
        {composer}
      </div>

      {isDragging ? (
        <div className="pointer-events-none absolute inset-3 z-20 flex items-center justify-center rounded-2xl border-2 border-dashed border-foreground/30 bg-background/90">
          <div className="flex flex-col items-center gap-2 text-center">
            <ImageUpIcon className="size-7 text-muted-foreground" />
            <p className="text-sm font-medium">تصویر را اینجا رها کنید</p>
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

