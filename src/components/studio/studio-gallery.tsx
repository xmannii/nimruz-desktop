"use client";

import { useStudio } from "@/components/studio/studio-context";
import { StudioMediaTile } from "@/components/studio/studio-media-tile";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useStudioItems } from "@/hooks/use-studio-items";
import { groupStudioItemsByDate } from "@/lib/studio/format";
import type { StudioKind } from "@/lib/studio/types";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

/** Date-grouped grid of image or video generations, live-updating. */
export function StudioGallery({
  kind,
  empty,
}: {
  kind: Extract<StudioKind, "image" | "video">;
  empty: ReactNode;
}) {
  const { openItem } = useStudio();
  const { items, isLoading, hasMore, loadMore } = useStudioItems({ kind });
  const gridClass = cn(
    "grid gap-3",
    kind === "video"
      ? "grid-cols-[repeat(auto-fill,minmax(16rem,1fr))]"
      : "grid-cols-[repeat(auto-fill,minmax(11rem,1fr))]"
  );

  if (isLoading && items.length === 0) {
    return (
      <div className={gridClass}>
        {Array.from({ length: kind === "video" ? 3 : 8 }, (_, index) => (
          <Skeleton
            key={index}
            className={cn("rounded-2xl", kind === "video" ? "aspect-video" : "aspect-square")}
          />
        ))}
      </div>
    );
  }

  if (items.length === 0) return <>{empty}</>;

  return (
    <div className="flex flex-col gap-6">
      {groupStudioItemsByDate(items).map((group) => (
        <section key={group.label} className="flex flex-col gap-3">
          <h2 className="text-xs font-medium text-muted-foreground">{group.label}</h2>
          <div className={gridClass}>
            {group.items.map((item) => (
              <StudioMediaTile key={item.id} item={item} onOpen={openItem} />
            ))}
          </div>
        </section>
      ))}
      {hasMore ? (
        <div className="flex justify-center">
          <Button type="button" variant="outline" className="rounded-full" onClick={loadMore}>
            نمایش موارد قدیمی‌تر
          </Button>
        </div>
      ) : null}
    </div>
  );
}

/** Centered hero shown before the first generation in a tab. */
export function StudioEmptyHero({
  icon,
  title,
  description,
  suggestions,
  onSuggestion,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  suggestions?: string[];
  onSuggestion?: (suggestion: string) => void;
}) {
  return (
    <div className="flex flex-col items-center gap-5 px-4 py-14 text-center">
      <span className="flex size-14 items-center justify-center rounded-3xl bg-gradient-to-br from-primary/20 via-primary/10 to-transparent text-primary ring-1 ring-primary/15 [&_svg]:size-6">
        {icon}
      </span>
      <div className="flex max-w-md flex-col gap-1.5">
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        <p className="text-sm leading-6 text-muted-foreground">{description}</p>
      </div>
      {suggestions && onSuggestion ? (
        <div className="flex max-w-2xl flex-wrap justify-center gap-2">
          {suggestions.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              className="rounded-full border border-border/70 bg-background px-3.5 py-1.5 text-xs text-muted-foreground transition-colors hover:border-border hover:bg-muted hover:text-foreground"
              onClick={() => onSuggestion(suggestion)}
            >
              {suggestion}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
