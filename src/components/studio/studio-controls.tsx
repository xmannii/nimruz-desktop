"use client";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { StudioPreset } from "@/lib/studio/presets";
import { cn } from "@/lib/utils";
import { CheckIcon, PaletteIcon } from "lucide-react";
import { useState, type ReactNode } from "react";

export const studioPillClass =
  "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-transparent bg-muted/70 px-2.5 text-xs font-medium text-foreground/85 transition-colors hover:bg-muted hover:text-foreground focus-visible:border-ring focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 data-[popup-open]:bg-muted";

export type StudioChipOption = { value: string; label: string; detail?: string };

/** Compact pill select used in the composer toolbar. */
export function StudioOptionChip({
  value,
  onValueChange,
  options,
  label,
  icon,
  disabled = false,
  renderValue,
}: {
  value: string;
  onValueChange: (value: string) => void;
  options: StudioChipOption[];
  label: string;
  icon?: ReactNode;
  disabled?: boolean;
  renderValue?: (option: StudioChipOption | undefined) => ReactNode;
}) {
  const selected = options.find((option) => option.value === value);
  return (
    <Select
      value={value}
      onValueChange={(next) => {
        if (typeof next === "string" && next) onValueChange(next);
      }}
      disabled={disabled || options.length === 0}
    >
      <SelectTrigger
        size="sm"
        aria-label={label}
        title={label}
        className={cn(studioPillClass, "shadow-none dark:bg-muted/70 [&>svg:last-child]:hidden")}
      >
        {icon}
        <SelectValue>{renderValue ? renderValue(selected) : selected?.label ?? label}</SelectValue>
      </SelectTrigger>
      <SelectContent align="end" side="top" alignItemWithTrigger={false} className="min-w-44" dir="rtl">
        <SelectGroup>
          <SelectLabel>{label}</SelectLabel>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              <span className="flex w-full items-center justify-between gap-4">
                <span>{option.label}</span>
                {option.detail ? (
                  <span className="text-[10px] text-muted-foreground">{option.detail}</span>
                ) : null}
              </span>
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}

/** Tiny rectangle that previews an aspect ratio. */
export function AspectRatioGlyph({ ratio, size = 12 }: { ratio: string; size?: number }) {
  const [width, height] = ratio.split(":").map(Number);
  const scale = size / Math.max(width || 1, height || 1);
  return (
    <span
      aria-hidden
      className="inline-block shrink-0 rounded-[2.5px] border-[1.5px] border-current opacity-75"
      style={{
        width: `${Math.max(5, (width || 1) * scale)}px`,
        height: `${Math.max(5, (height || 1) * scale)}px`,
      }}
    />
  );
}

/** Visual grid of ratios, closer to how people think about frames. */
export function AspectRatioPicker({
  value,
  onValueChange,
  ratios,
}: {
  value: string;
  onValueChange: (value: string) => void;
  ratios: string[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger className={studioPillClass} aria-label="نسبت تصویر" title="نسبت تصویر">
        <AspectRatioGlyph ratio={value} />
        <span dir="ltr" className="tabular-nums">{value}</span>
      </PopoverTrigger>
      <PopoverContent side="top" align="end" className="w-auto gap-2 rounded-2xl p-2" dir="rtl">
        <div className="px-1.5 pt-0.5 text-[11px] font-medium text-muted-foreground">نسبت تصویر</div>
        <div className="grid grid-cols-5 gap-1">
          {ratios.map((ratio) => (
            <button
              key={ratio}
              type="button"
              className={cn(
                "flex h-16 w-14 flex-col items-center justify-center gap-1.5 rounded-xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                ratio === value && "bg-muted text-foreground"
              )}
              onClick={() => {
                onValueChange(ratio);
                setOpen(false);
              }}
            >
              <AspectRatioGlyph ratio={ratio} size={20} />
              <span dir="ltr" className="text-[10px] tabular-nums">{ratio}</span>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** Simple two-column list for style presets and camera moves. */
export function PresetPicker({
  presets,
  value,
  onValueChange,
  label,
  icon,
}: {
  presets: StudioPreset[];
  value: string;
  onValueChange: (value: string) => void;
  label: string;
  icon?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const selected = presets.find((preset) => preset.id === value) ?? presets[0];
  const active = selected.id !== "none";
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className={cn(studioPillClass, active && "bg-foreground/10 text-foreground")}
        aria-label={label}
        title={label}
      >
        {icon ?? <PaletteIcon className="size-3.5 opacity-70" />}
        <span>{active ? selected.label : label}</span>
      </PopoverTrigger>
      <PopoverContent side="top" align="end" className="w-64 gap-1 rounded-2xl p-1.5" dir="rtl">
        <div className="px-2 pb-1 pt-1 text-[11px] font-medium text-muted-foreground">{label}</div>
        <div className="grid grid-cols-2 gap-0.5">
          {presets.map((preset) => {
            const isActive = preset.id === selected.id;
            return (
              <button
                key={preset.id}
                type="button"
                className={cn(
                  "flex items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-start text-xs transition-colors hover:bg-muted",
                  isActive && "bg-muted font-medium"
                )}
                onClick={() => {
                  onValueChange(preset.id);
                  setOpen(false);
                }}
              >
                {preset.label}
                {isActive ? <CheckIcon className="size-3.5 shrink-0" /> : null}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
