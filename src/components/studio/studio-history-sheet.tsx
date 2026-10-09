"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useStudioItems } from "@/hooks/use-studio-items";
import {
  groupStudioItemsByDate,
  isStudioItemBusy,
  STUDIO_KIND_LABELS,
  studioMediaUrl,
} from "@/lib/studio/format";
import { STUDIO_KINDS, type StudioItem, type StudioKind } from "@/lib/studio/types";
import { cn } from "@/lib/utils";
import {
  AlertTriangleIcon,
  AudioLinesIcon,
  FileTextIcon,
  FilmIcon,
  HistoryIcon,
  ImageIcon,
  SearchIcon,
} from "lucide-react";
import { useDeferredValue, useState } from "react";

const KIND_ICONS: Record<StudioKind, typeof ImageIcon> = {
  image: ImageIcon,
  video: FilmIcon,
  speech: AudioLinesIcon,
  transcript: FileTextIcon,
};

function HistoryThumb({ item }: { item: StudioItem }) {
  const Icon = KIND_ICONS[item.kind];
  const showImage = item.kind === "image" && item.hasMedia;
  const showVideo = item.kind === "video" && item.hasMedia;
  return (
    <span className="relative flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-muted text-muted-foreground ring-1 ring-foreground/5">
      {showImage ? (
        <img src={studioMediaUrl(item)} alt="" loading="lazy" className="size-full object-cover" />
      ) : showVideo ? (
        <video src={studioMediaUrl(item)} muted preload="metadata" className="size-full object-cover" />
      ) : isStudioItemBusy(item) ? (
        <Spinner className="size-4" />
      ) : item.status === "failed" || item.status === "interrupted" ? (
        <AlertTriangleIcon className="size-4 text-destructive" />
      ) : (
        <Icon className="size-4" />
      )}
    </span>
  );
}

export function StudioHistorySheet({
  open,
  onOpenChange,
  onOpenItem,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenItem: (item: StudioItem) => void;
}) {
  const [kind, setKind] = useState<StudioKind | "all">("all");
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const { items, isLoading, hasMore, loadMore } = useStudioItems({
    kind: kind === "all" ? undefined : kind,
    query: deferredQuery,
  });
  const groups = groupStudioItemsByDate(items);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="w-full gap-0 p-0 sm:max-w-md" dir="rtl">
        <SheetHeader className="gap-1 border-b border-border/60 p-5 pe-12">
          <SheetTitle className="flex items-center gap-2">
            <HistoryIcon className="size-4" />
            تاریخچه استودیو
          </SheetTitle>
          <SheetDescription>همه تصویرها، ویدیوها، صداها و رونویسی‌ها</SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-3 border-b border-border/60 p-4">
          <div className="relative">
            <SearchIcon className="pointer-events-none absolute inset-y-0 start-3 my-auto size-4 text-muted-foreground" />
            <Input
              type="search"
              value={query}
              placeholder="جستجو در درخواست‌ها و متن‌ها…"
              aria-label="جستجو در تاریخچه"
              className="h-9 rounded-full ps-9"
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <ToggleGroup
            value={[kind]}
            onValueChange={(values) => {
              const next = values[0];
              if (next) setKind(next as StudioKind | "all");
            }}
            variant="outline"
            size="sm"
            spacing={1}
            className="flex-wrap"
            aria-label="فیلتر نوع"
          >
            <ToggleGroupItem value="all" className="rounded-full px-3">
              همه
            </ToggleGroupItem>
            {STUDIO_KINDS.map((value) => (
              <ToggleGroupItem key={value} value={value} className="rounded-full px-3">
                {STUDIO_KIND_LABELS[value]}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2">
          {isLoading && items.length === 0 ? (
            <div className="flex flex-col gap-2 p-2">
              {Array.from({ length: 6 }, (_, index) => (
                <Skeleton key={index} className="h-14 w-full rounded-xl" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-6 py-16 text-center">
              <HistoryIcon className="size-6 text-muted-foreground/60" />
              <p className="text-sm font-medium">
                {query ? "چیزی پیدا نشد" : "هنوز چیزی ساخته نشده"}
              </p>
              <p className="text-xs text-muted-foreground">
                {query
                  ? "عبارت دیگری را جستجو کنید."
                  : "ساخته‌های شما اینجا نگه داشته می‌شوند."}
              </p>
            </div>
          ) : (
            groups.map((group) => (
              <section key={group.label} className="mb-2">
                <h3 className="px-3 pb-1 pt-3 text-[11px] font-medium text-muted-foreground">
                  {group.label}
                </h3>
                {group.items.map((item) => {
                  const Icon = KIND_ICONS[item.kind];
                  return (
                    <button
                      key={item.id}
                      type="button"
                      className="flex w-full items-center gap-3 rounded-2xl p-2 text-start transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
                      onClick={() => {
                        onOpenItem(item);
                        onOpenChange(false);
                      }}
                    >
                      <HistoryThumb item={item} />
                      <span className="min-w-0 flex-1">
                        <span dir="auto" className="block truncate text-sm font-medium">
                          {item.title}
                        </span>
                        <span className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                          <Icon className="size-3" />
                          {STUDIO_KIND_LABELS[item.kind]}
                          <span aria-hidden>·</span>
                          <span className={cn("truncate", item.kind !== "transcript" && "font-mono text-[10px]")} dir="ltr">
                            {item.kind === "transcript"
                              ? new Intl.DateTimeFormat("fa-IR", { timeStyle: "short" }).format(item.createdAt)
                              : item.modelId.split("/").at(-1)}
                          </span>
                        </span>
                      </span>
                    </button>
                  );
                })}
              </section>
            ))
          )}
          {hasMore ? (
            <div className="flex justify-center p-3">
              <Button type="button" variant="ghost" size="sm" onClick={loadMore}>
                موارد بیشتر
              </Button>
            </div>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
