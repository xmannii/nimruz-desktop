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
import {
  ModelLogo,
  providerLogoKey,
  resolveModelLogo,
} from "@/components/studio/model-logo";
import { CheckIcon, ChevronDownIcon, RefreshCwIcon, SearchIcon } from "lucide-react";
import { useMemo, useRef, useState, type ReactNode } from "react";

export type StudioModelOption = {
  /** Unique key across providers. */
  key: string;
  id: string;
  name: string;
  /** Service that runs the model: "openrouter", "google", or "elevenlabs". */
  provider?: string;
  /** Vendor sub-group inside the provider, e.g. "openai". */
  group?: string;
  meta?: string;
  badge?: string;
  /** Position in the curated "recommended" list, if featured. */
  rank?: number | null;
  isNew?: boolean;
};

const PROVIDER_ORDER = ["openrouter", "google", "elevenlabs"];

const PROVIDER_LABELS: Record<string, { full: string; short: string }> = {
  openrouter: { full: "OpenRouter", short: "OpenRouter" },
  google: { full: "Google AI Studio", short: "Google" },
  elevenlabs: { full: "ElevenLabs", short: "ElevenLabs" },
};

function providerOf(option: StudioModelOption) {
  return option.provider ?? "openrouter";
}

function providerLabel(provider: string, size: "full" | "short" = "full") {
  return PROVIDER_LABELS[provider]?.[size] ?? provider;
}

function OptionLogo({ option, className }: { option: StudioModelOption; className?: string }) {
  return (
    <ModelLogo
      logo={resolveModelLogo(option.id, option.provider)}
      fallback={option.group ?? modelVendor(option.id)}
      className={className}
    />
  );
}

function ModelRow({
  option,
  selected,
  showProvider,
  onChoose,
}: {
  option: StudioModelOption;
  selected: boolean;
  showProvider: boolean;
  onChoose: () => void;
}) {
  return (
    <button
      type="button"
      className={cn(
        "flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-start transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none",
        selected && "bg-muted"
      )}
      onClick={onChoose}
    >
      <OptionLogo option={option} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-xs font-medium">{shortModelName(option.name)}</span>
          {option.isNew ? (
            <span dir="rtl" className="shrink-0 rounded-full bg-emerald-500/12 px-1.5 py-px text-[9px] font-medium text-emerald-700 dark:text-emerald-400">
              جدید
            </span>
          ) : null}
          {option.badge ? (
            <span dir="rtl" className="shrink-0 rounded-full bg-muted px-1.5 py-px text-[9px] font-medium text-muted-foreground">
              {option.badge}
            </span>
          ) : null}
        </span>
        {option.meta ? (
          <span dir="rtl" className="mt-0.5 block truncate text-start text-[10px] text-muted-foreground">
            {option.meta}
          </span>
        ) : null}
      </span>
      {showProvider ? (
        <span className="shrink-0 rounded-md border border-border/70 px-1.5 py-px text-[9px] font-medium text-muted-foreground">
          {providerLabel(providerOf(option), "short")}
        </span>
      ) : null}
      {selected ? <CheckIcon className="size-3.5 shrink-0" /> : null}
    </button>
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
  const [providerFilter, setProviderFilter] = useState<string>("all");
  const searchRef = useRef<HTMLInputElement>(null);
  const selected = options.find((option) => option.key === value) ?? null;

  const providers = useMemo(() => {
    const counts = new Map<string, number>();
    for (const option of options) {
      const provider = providerOf(option);
      counts.set(provider, (counts.get(provider) ?? 0) + 1);
    }
    return Array.from(counts, ([id, count]) => ({ id, count })).sort(
      (a, b) => PROVIDER_ORDER.indexOf(a.id) - PROVIDER_ORDER.indexOf(b.id)
    );
  }, [options]);
  const filter = providers.some((provider) => provider.id === providerFilter) ? providerFilter : "all";

  /** Sections: recommended first, then one per provider with vendor groups. */
  const sections = useMemo(() => {
    const needle = normalizeSearchText(query);
    const visible = options.filter((option) => {
      if (filter !== "all" && providerOf(option) !== filter) return false;
      return (
        !needle ||
        normalizeSearchText(
          `${option.name} ${option.id} ${option.group ?? ""} ${providerLabel(providerOf(option))}`
        ).includes(needle)
      );
    });
    const result: Array<{
      key: string;
      title: string;
      subtitle?: string;
      groups: Array<{ name: string | null; items: StudioModelOption[] }>;
    }> = [];
    const featured = visible
      .filter((option) => typeof option.rank === "number")
      .sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0));
    if (!needle && featured.length > 0) {
      result.push({ key: "featured", title: "پیشنهادی", groups: [{ name: null, items: featured }] });
    }
    for (const provider of providers) {
      if (filter !== "all" && provider.id !== filter) continue;
      const items = visible.filter((option) => providerOf(option) === provider.id);
      if (items.length === 0) continue;
      const vendors = new Map<string, StudioModelOption[]>();
      for (const option of items) {
        const vendor = option.group ?? modelVendor(option.id);
        const bucket = vendors.get(vendor);
        if (bucket) bucket.push(option);
        else vendors.set(vendor, [option]);
      }
      const groupByVendor = provider.id === "openrouter" && vendors.size > 1;
      result.push({
        key: provider.id,
        title: providerLabel(provider.id),
        subtitle: `${items.length.toLocaleString("fa-IR")} مدل`,
        groups: groupByVendor
          ? Array.from(vendors, ([name, groupItems]) => ({ name, items: groupItems }))
          : [{ name: null, items }],
      });
    }
    return result;
  }, [options, providers, filter, query]);

  const firstMatch = sections[0]?.groups[0]?.items[0];

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
        aria-label={
          selected
            ? `${label}: ${selected.name} (${providerLabel(providerOf(selected))})`
            : `انتخاب ${label}`
        }
        className={cn(
          "inline-flex h-8 max-w-64 items-center gap-1.5 rounded-full border border-transparent bg-muted/70 ps-1 pe-2.5 text-xs font-medium transition-colors hover:bg-muted focus-visible:border-ring focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50",
          open && "bg-muted"
        )}
      >
        {isLoading && !selected ? (
          <Spinner className="mx-1 size-3.5" />
        ) : selected ? (
          <OptionLogo option={selected} className="size-6 rounded-full" />
        ) : (
          <ModelLogo logo={null} fallback="?" className="size-6 rounded-full" />
        )}
        <span className="flex min-w-0 items-baseline gap-1.5" dir="ltr">
          <span className="truncate">
            {selected ? shortModelName(selected.name) : isLoading ? "…" : label}
          </span>
          {selected ? (
            <span className="shrink-0 text-[10px] font-normal text-muted-foreground">
              {providerLabel(providerOf(selected), "short")}
            </span>
          ) : null}
        </span>
        <ChevronDownIcon className="size-3.5 shrink-0 text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent
        align="end"
        side="top"
        sideOffset={8}
        initialFocus={searchRef}
        className="w-[min(24rem,calc(100vw-2rem))] gap-0 overflow-hidden rounded-2xl p-0"
      >
        <div dir="rtl" className="flex flex-col gap-1.5 border-b border-border/60 p-1.5">
          <div className="flex items-center gap-1.5">
            <div className="relative flex-1">
              <SearchIcon className="pointer-events-none absolute inset-y-0 start-2.5 my-auto size-3.5 text-muted-foreground" />
              <Input
                ref={searchRef}
                type="search"
                autoComplete="off"
                aria-label={`جستجوی ${label}`}
                placeholder="جستجوی مدل یا سازنده…"
                value={query}
                className="h-8 ps-8 text-xs md:text-xs"
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key !== "Enter" || !firstMatch) return;
                  event.preventDefault();
                  choose(firstMatch.key);
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
          {providers.length > 1 ? (
            <div className="flex flex-wrap gap-1" role="tablist" aria-label="ارائه‌دهنده">
              {[{ id: "all", count: options.length }, ...providers].map((provider) => (
                <button
                  key={provider.id}
                  type="button"
                  role="tab"
                  aria-selected={filter === provider.id}
                  className={cn(
                    "inline-flex h-7 items-center gap-1 rounded-lg px-2.5 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                    filter === provider.id && "bg-muted font-medium text-foreground"
                  )}
                  onClick={() => setProviderFilter(provider.id)}
                >
                  {provider.id === "all" ? null : (
                    <ModelLogo logo={providerLogoKey(provider.id)} fallback={provider.id} tile={false} className="size-3.5" />
                  )}
                  {provider.id === "all" ? "همه" : providerLabel(provider.id, "short")}
                  <span className="text-[10px] tabular-nums text-muted-foreground/80">
                    {provider.count.toLocaleString("fa-IR")}
                  </span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <ScrollArea className="h-80" dir="ltr">
          <div className="flex flex-col p-1.5" dir="ltr">
            {sections.length === 0 ? (
              <p dir="rtl" className="px-3 py-10 text-center text-xs text-muted-foreground">
                {isLoading ? "در حال دریافت مدل‌ها…" : "مدلی پیدا نشد."}
              </p>
            ) : (
              sections.map((section) => (
                <section key={section.key} className="mb-2">
                  <div
                    dir="rtl"
                    className="sticky top-0 z-10 flex items-baseline justify-between bg-popover px-2 pb-1 pt-2"
                  >
                    <span className="flex items-center gap-1.5 text-[11px] font-semibold text-foreground/80">
                      {section.key !== "featured" ? (
                        <ModelLogo logo={providerLogoKey(section.key)} fallback={section.key} tile={false} className="size-3.5" />
                      ) : null}
                      {section.title}
                    </span>
                    {section.subtitle ? (
                      <span className="text-[10px] text-muted-foreground">{section.subtitle}</span>
                    ) : null}
                  </div>
                  {section.groups.map((group) => (
                    <div key={group.name ?? "all"}>
                      {group.name ? (
                        <div className="px-2 pb-0.5 pt-1.5 text-[10px] uppercase tracking-wide text-muted-foreground/80">
                          {group.name}
                        </div>
                      ) : null}
                      {group.items.map((option) => (
                        <ModelRow
                          key={`${section.key}:${option.key}`}
                          option={option}
                          selected={option.key === value}
                          showProvider={section.key === "featured" && providers.length > 1}
                          onChoose={() => choose(option.key)}
                        />
                      ))}
                    </div>
                  ))}
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
