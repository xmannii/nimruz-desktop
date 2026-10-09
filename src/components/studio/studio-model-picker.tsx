"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Spinner } from "@/components/ui/spinner";
import { modelVendor, shortModelName } from "@/lib/studio/format";
import { normalizeSearchText } from "@/lib/studio/search";
import { cn } from "@/lib/utils";
import { CheckIcon, ChevronDownIcon, RefreshCwIcon, SearchIcon } from "lucide-react";
import { useMemo, useRef, useState, type ReactNode } from "react";

export type StudioModelOption = {
  /** Unique key across providers. */
  key: string;
  id: string;
  name: string;
  /** Group heading, usually the vendor or provider. */
  group?: string;
  meta?: string;
  badge?: string;
};

function VendorMark({ name, className }: { name: string; className?: string }) {
  return (
    <span
      className={cn(
        "flex size-7 shrink-0 items-center justify-center rounded-lg bg-muted text-[10px] font-semibold uppercase text-muted-foreground",
        className
      )}
      aria-hidden
    >
      {name.slice(0, 2)}
    </span>
  );
}

export function StudioModelPicker({
  options,
  value,
  onValueChange,
  isLoading = false,
  onRefresh,
  disabled = false,
  footer,
  label = "مدل",
}: {
  options: StudioModelOption[];
  value: string | null;
  onValueChange: (key: string) => void;
  isLoading?: boolean;
  onRefresh?: () => void;
  disabled?: boolean;
  footer?: ReactNode;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const selected = options.find((option) => option.key === value) ?? null;

  const groups = useMemo(() => {
    const needle = normalizeSearchText(query);
    const filtered = needle
      ? options.filter((option) =>
          normalizeSearchText(
            `${option.name} ${option.id} ${option.group ?? ""} ${option.meta ?? ""}`
          ).includes(needle)
        )
      : options;
    const map = new Map<string, StudioModelOption[]>();
    for (const option of filtered) {
      const group = option.group ?? modelVendor(option.id);
      const bucket = map.get(group);
      if (bucket) bucket.push(option);
      else map.set(group, [option]);
    }
    return Array.from(map, ([group, items]) => ({ group, items }));
  }, [options, query]);

  function choose(key: string) {
    onValueChange(key);
    setOpen(false);
    setQuery("");
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery("");
      }}
    >
      <PopoverTrigger
        disabled={disabled}
        aria-label={selected ? `${label}: ${selected.name}` : `انتخاب ${label}`}
        className={cn(
          "inline-flex h-8 max-w-56 items-center gap-1.5 rounded-full border border-border/70 bg-muted/60 ps-1 pe-2 text-xs font-medium transition-colors hover:bg-muted focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50",
          open && "bg-muted"
        )}
      >
        {isLoading && !selected ? (
          <Spinner className="mx-1 size-3.5" />
        ) : (
          <VendorMark
            name={selected ? (selected.group ?? modelVendor(selected.id)) : "?"}
            className="size-6 rounded-full text-[9px]"
          />
        )}
        <span className="min-w-0 truncate" dir="ltr">
          {selected ? shortModelName(selected.name) : isLoading ? "…" : label}
        </span>
        <ChevronDownIcon className="size-3.5 shrink-0 text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="bottom"
        sideOffset={8}
        initialFocus={searchRef}
        className="w-[min(22rem,calc(100vw-2rem))] gap-0 overflow-hidden rounded-2xl p-0"
      >
        <div dir="rtl" className="flex items-center gap-1.5 border-b border-border/60 p-1.5">
          <div className="relative flex-1">
            <SearchIcon className="pointer-events-none absolute inset-y-0 start-2.5 my-auto size-3.5 text-muted-foreground" />
            <Input
              ref={searchRef}
              type="search"
              autoComplete="off"
              aria-label={`جستجوی ${label}`}
              placeholder={`جستجوی ${label}…`}
              value={query}
              className="h-8 ps-8 text-xs md:text-xs"
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                const first = groups[0]?.items[0];
                if (!first) return;
                event.preventDefault();
                choose(first.key);
              }}
            />
          </div>
          {onRefresh ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="به‌روزرسانی فهرست"
              disabled={isLoading}
              onClick={onRefresh}
            >
              {isLoading ? <Spinner /> : <RefreshCwIcon />}
            </Button>
          ) : null}
        </div>
        <ScrollArea className="h-72" dir="ltr">
          <div className="flex flex-col p-1.5" dir="ltr">
            {groups.length === 0 ? (
              <p dir="rtl" className="px-3 py-10 text-center text-xs text-muted-foreground">
                {isLoading ? "در حال دریافت مدل‌ها…" : "مدلی پیدا نشد."}
              </p>
            ) : (
              groups.map(({ group, items }) => (
                <section key={group} className="mb-1">
                  <div className="px-2 pb-1 pt-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    {group}
                  </div>
                  {items.map((option) => {
                    const isSelected = option.key === value;
                    return (
                      <button
                        key={option.key}
                        type="button"
                        className={cn(
                          "flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-start transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none",
                          isSelected && "bg-muted"
                        )}
                        onClick={() => choose(option.key)}
                      >
                        <VendorMark name={option.group ?? modelVendor(option.id)} />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1.5">
                            <span className="truncate text-xs font-medium">
                              {shortModelName(option.name)}
                            </span>
                            {option.badge ? (
                              <span className="shrink-0 rounded-full bg-primary/10 px-1.5 py-px text-[9px] font-medium text-primary">
                                {option.badge}
                              </span>
                            ) : null}
                          </span>
                          {option.meta ? (
                            <span className="mt-0.5 block truncate text-[10px] text-muted-foreground">
                              {option.meta}
                            </span>
                          ) : null}
                        </span>
                        {isSelected ? (
                          <CheckIcon className="size-3.5 shrink-0 text-primary" />
                        ) : null}
                      </button>
                    );
                  })}
                </section>
              ))
            )}
          </div>
        </ScrollArea>
        {footer ? (
          <div dir="rtl" className="border-t border-border/60 p-1.5">
            {footer}
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
