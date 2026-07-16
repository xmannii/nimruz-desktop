"use client";

import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DEFAULT_FONT_FAMILY,
  SYSTEM_FONT_VALUE,
  getFontFamilyLabel,
  loadSystemFonts,
} from "@/lib/settings/appearance";
import { cn } from "@/lib/utils";
import { CheckIcon, ChevronDownIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type FontPickerProps = {
  value: string;
  onValueChange: (value: string) => void;
  disabled?: boolean;
};

const PINNED_FONTS = [
  {
    value: DEFAULT_FONT_FAMILY,
    label: "وزیرمتن (پیش‌فرض)",
  },
  {
    value: SYSTEM_FONT_VALUE,
    label: "فونت سیستم",
  },
] as const;

function fontStack(fontFamily: string) {
  if (fontFamily === SYSTEM_FONT_VALUE) {
    return "ui-sans-serif, system-ui, sans-serif";
  }
  return `"${fontFamily}", ui-sans-serif, system-ui, sans-serif`;
}

export function FontPicker({
  value,
  onValueChange,
  disabled = false,
}: FontPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [systemFonts, setSystemFonts] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;

    setLoading(true);
    setError(null);

    void loadSystemFonts()
      .then((fonts) => {
        if (cancelled) return;
        setSystemFonts(fonts);
        if (fonts.length === 0) {
          setError("فونت‌های سیستم پیدا نشد");
        }
      })
      .catch((loadError) => {
        console.error("Failed to load system fonts:", loadError);
        if (!cancelled) {
          setError("خطا در خواندن فونت‌های سیستم");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open]);

  const installedFonts = useMemo(() => {
    const pinnedValues = new Set<string>(
      PINNED_FONTS.map((font) => font.value)
    );
    const merged = new Set<string>(systemFonts);
    merged.add(DEFAULT_FONT_FAMILY);

    return [...merged]
      .filter((font) => !pinnedValues.has(font))
      .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  }, [systemFonts]);

  const filteredFonts = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return installedFonts;
    return installedFonts.filter((font) =>
      font.toLowerCase().includes(normalized)
    );
  }, [installedFonts, query]);

  function selectFont(nextValue: string) {
    onValueChange(nextValue);
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
        className={cn(
          "flex h-11 w-full items-center justify-between rounded-2xl border border-border/70 bg-background px-3.5 text-sm transition-colors hover:bg-muted/50 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50",
          open && "bg-muted/50"
        )}
      >
        <span
          className="min-w-0 truncate"
          style={{ fontFamily: fontStack(value) }}
        >
          {getFontFamilyLabel(value)}
        </span>
        <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground" />
      </PopoverTrigger>

      <PopoverContent
        align="start"
        className="w-[min(24rem,calc(100vw-2rem))] gap-0 overflow-hidden p-0"
      >
        <div className="border-b border-border/60 p-2">
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="جستجوی فونت..."
            className="h-9"
            autoFocus
          />
        </div>

        <ScrollArea className="h-80">
          <div className="flex flex-col gap-1 p-1.5" dir="rtl">
            <div className="px-2 pb-1 pt-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              پیشنهادی
            </div>
            {PINNED_FONTS.map((font) => {
              const isSelected = value === font.value;
              return (
                <button
                  key={font.value}
                  type="button"
                  onClick={() => selectFont(font.value)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-lg px-2 py-2 text-right text-sm transition-colors hover:bg-muted",
                    isSelected && "bg-muted"
                  )}
                >
                  <span
                    className="min-w-0 flex-1 truncate"
                    style={{ fontFamily: fontStack(font.value) }}
                  >
                    {font.label}
                  </span>
                  {isSelected ? (
                    <CheckIcon className="size-3.5 shrink-0 text-primary" />
                  ) : null}
                </button>
              );
            })}

            <div className="px-2 pb-1 pt-3 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              فونت‌های نصب‌شده
            </div>

            {loading ? (
              <div className="px-3 py-8 text-center text-xs text-muted-foreground">
                در حال خواندن فونت‌های سیستم...
              </div>
            ) : error ? (
              <div className="px-3 py-8 text-center text-xs text-muted-foreground">
                {error}
              </div>
            ) : filteredFonts.length === 0 ? (
              <div className="px-3 py-8 text-center text-xs text-muted-foreground">
                فونتی یافت نشد
              </div>
            ) : (
              filteredFonts.map((font) => {
                const isSelected = value === font;
                return (
                  <button
                    key={font}
                    type="button"
                    onClick={() => selectFont(font)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-lg px-2 py-2 text-right text-sm transition-colors hover:bg-muted",
                      isSelected && "bg-muted"
                    )}
                  >
                    <span
                      className="min-w-0 flex-1 truncate"
                      style={{ fontFamily: fontStack(font) }}
                    >
                      {font}
                    </span>
                    {isSelected ? (
                      <CheckIcon className="size-3.5 shrink-0 text-primary" />
                    ) : null}
                  </button>
                );
              })
            )}
          </div>
        </ScrollArea>

        <div className="border-t border-border/60 px-3 py-2 text-xs text-muted-foreground">
          {loading
            ? "در حال بارگذاری..."
            : `${installedFonts.length.toLocaleString("fa-IR")} فونت نصب‌شده`}
        </div>
      </PopoverContent>
    </Popover>
  );
}
