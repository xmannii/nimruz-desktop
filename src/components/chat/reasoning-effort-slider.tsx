"use client";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
  getReasoningEffortDescription,
  getReasoningEffortIndex,
  getReasoningEffortLabel,
  REASONING_EFFORT_LEVELS,
  type ReasoningEffort,
} from "@/lib/models/reasoning";
import { BrainIcon, CheckIcon } from "lucide-react";
import { useState } from "react";

type ReasoningEffortSliderProps = {
  value: ReasoningEffort;
  onValueChange: (value: ReasoningEffort) => void;
  disabled?: boolean;
  compact?: boolean;
};

const EFFORT_OPACITY_BY_INDEX = [
  "opacity-40",
  "opacity-50",
  "opacity-65",
  "opacity-80",
  "opacity-90",
  "opacity-100",
];

function EffortIcon({
  level,
  className,
}: {
  level: number;
  className?: string;
}) {
  return (
    <BrainIcon
      className={cn(EFFORT_OPACITY_BY_INDEX[level], className)}
      aria-hidden
    />
  );
}

export function ReasoningEffortSlider({
  value,
  onValueChange,
  disabled = false,
  compact = false,
}: ReasoningEffortSliderProps) {
  const [open, setOpen] = useState(false);
  const index = getReasoningEffortIndex(value);
  const isOff = value === "none";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        disabled={disabled}
        title={compact ? `عمق استدلال: ${getReasoningEffortLabel(value)}` : undefined}
        className={cn(
          "inline-flex items-center rounded-full border border-border/70 bg-muted/70 text-xs font-medium text-foreground shadow-none transition-colors hover:bg-muted focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50",
          compact
            ? "h-10 w-10 shrink-0 justify-center gap-0 px-0"
            : "h-8 max-w-32 gap-1.5 px-2",
          open && "bg-muted"
        )}
        aria-label={`عمق استدلال: ${getReasoningEffortLabel(value)}`}
      >
        <EffortIcon
          level={index}
          className={cn(
            "size-4 shrink-0",
            isOff ? "text-muted-foreground" : "text-primary"
          )}
        />
        {!compact ? (
          <span className="min-w-0 truncate">{getReasoningEffortLabel(value)}</span>
        ) : null}
      </PopoverTrigger>

      <PopoverContent
        align="start"
        side="top"
        sideOffset={8}
        className="w-64 gap-0 overflow-hidden rounded-xl p-0"
      >
        <div
          dir="rtl"
          className="flex items-center justify-between border-b border-border/60 px-3 py-2"
        >
          <span className="text-sm font-medium">عمق استدلال</span>
          <span className="text-[10px] text-muted-foreground">
            میزان فکر کردن مدل
          </span>
        </div>

        <div className="space-y-0.5 p-1.5" dir="rtl">
          {REASONING_EFFORT_LEVELS.map((level, levelIndex) => {
            const isSelected = level === value;

            return (
              <Button
                key={level}
                type="button"
                variant="ghost"
                className={cn(
                  "h-auto w-full justify-start gap-2.5 rounded-lg px-2 py-2 text-right whitespace-normal",
                  isSelected && "bg-muted"
                )}
                onClick={() => {
                  onValueChange(level);
                  setOpen(false);
                }}
              >
                <EffortIcon
                  level={levelIndex}
                  className={cn(
                    "size-4 shrink-0",
                    level === "none" ? "text-muted-foreground" : "text-primary"
                  )}
                />

                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate text-xs font-medium">
                      {getReasoningEffortLabel(level)}
                    </span>
                    {isSelected ? (
                      <CheckIcon className="size-3.5 shrink-0 text-primary" />
                    ) : null}
                  </span>

                  <span className="mt-0.5 block truncate text-[10px] text-muted-foreground">
                    {getReasoningEffortDescription(level)}
                  </span>
                </span>
              </Button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
