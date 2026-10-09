"use client";

import { StudioMediaTile } from "@/components/studio/studio-media-tile";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useStudioItems } from "@/hooks/use-studio-items";
import { groupStudioItemsByDate } from "@/lib/studio/format";
import type { StudioKind } from "@/lib/studio/types";
import { cn } from "@/lib/utils";
import { ImageUpIcon } from "lucide-react";
import {
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type DragEvent,
  type ReactNode,
  type Ref,
} from "react";

export type StudioFeedHandle = { scrollToTop: () => void };

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

  const gridClass = cn(
    "grid gap-2",
    kind === "video"
      ? "grid-cols-[repeat(auto-fill,minmax(15rem,1fr))]"
      : "grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))]"
  );

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
                  <div className={gridClass}>
                    {group.items.map((item) => (
                      <StudioMediaTile key={item.id} item={item} siblings={items} />
                    ))}
                  </div>
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

