"use client";

import { Anthropic, DeepSeek, OpenAI } from "@/components/provider-logos";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import {
  formatModelPrice,
  formatTokenCount,
  getModelById,
  MODEL_GROUPS,
  type ModelId,
  type ProviderId,
} from "@/lib/models";
import { CheckIcon, ChevronDownIcon } from "lucide-react";
import type { ComponentType, SVGProps } from "react";
import { useState } from "react";

type ModelPickerProps = {
  value: ModelId;
  onValueChange: (value: ModelId) => void;
  disabled?: boolean;
  compact?: boolean;
};

const providerLogos: Record<
  ProviderId,
  ComponentType<SVGProps<SVGSVGElement>>
> = {
  deepseek: DeepSeek,
  anthropic: Anthropic,
  openai: OpenAI,
};

const providerLogoStyles: Record<ProviderId, string> = {
  deepseek: "bg-[#4D6BFE]/10",
  anthropic: "bg-[#D97757]",
  openai: "bg-[#111]",
};

function ProviderIcon({
  provider,
  className,
}: {
  provider: ProviderId;
  className?: string;
}) {
  const Logo = providerLogos[provider];

  return (
    <span
      className={cn(
        "flex size-7 shrink-0 items-center justify-center rounded-md",
        providerLogoStyles[provider],
        className
      )}
      aria-hidden
    >
      <Logo className="size-4" />
    </span>
  );
}

export function ModelPicker({
  value,
  onValueChange,
  disabled = false,
  compact = false,
}: ModelPickerProps) {
  const [open, setOpen] = useState(false);
  const selected = getModelById(value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        disabled={disabled}
        title={compact ? selected?.fullName : undefined}
        className={cn(
          "inline-flex items-center rounded-full border border-border/70 bg-muted/70 text-xs font-medium text-foreground shadow-none transition-colors hover:bg-muted focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50",
          compact
            ? "h-10 max-w-[7.5rem] shrink gap-1 px-2"
            : "h-8 max-w-44 gap-1.5 px-2",
          open && "bg-muted"
        )}
        aria-label={selected ? `مدل: ${selected.fullName}` : "انتخاب مدل"}
      >
        {selected ? (
          <ProviderIcon
            provider={selected.provider}
            className="size-5 shrink-0 rounded-sm [&_svg]:size-3"
          />
        ) : null}
        <span className={cn("min-w-0 truncate", compact && "text-[11px]")}>
          {selected?.name ?? "مدل"}
        </span>
        <ChevronDownIcon
          className={cn(
            "shrink-0 text-muted-foreground",
            compact ? "size-3" : "size-3.5"
          )}
        />
      </PopoverTrigger>

      <PopoverContent
        align="start"
        side="top"
        sideOffset={8}
        className="w-[min(20rem,calc(100vw-2rem))] gap-0 overflow-hidden rounded-xl p-0"
      >
        <div
          dir="rtl"
          className="flex items-center justify-between border-b border-border/60 px-3 py-2"
        >
          <span className="text-sm font-medium">انتخاب مدل</span>
          <span className="text-[10px] text-muted-foreground">
            context · output · $/1M
          </span>
        </div>

        <ScrollArea className="h-64" dir="ltr">
          <div className="space-y-1 p-1.5" dir="ltr">
            {MODEL_GROUPS.map((group) => (
              <section key={group.provider}>
                <div className="px-2 pb-1 pt-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  {group.label}
                </div>

                {group.models.map((model) => {
                  const isSelected = model.id === value;

                  return (
                    <Button
                      key={model.id}
                      type="button"
                      variant="ghost"
                      className={cn(
                        "mb-0.5 h-auto w-full justify-start gap-2.5 rounded-lg px-2 py-2 text-left whitespace-normal",
                        isSelected && "bg-muted"
                      )}
                      onClick={() => {
                        onValueChange(model.id);
                        setOpen(false);
                      }}
                    >
                      <ProviderIcon provider={model.provider} />

                      <span className="min-w-0 flex-1">
                        <span className="flex items-center justify-between gap-2">
                          <span className="truncate text-xs font-medium">
                            {model.fullName}
                          </span>
                          {isSelected ? (
                            <CheckIcon className="size-3.5 shrink-0 text-primary" />
                          ) : null}
                        </span>

                        <span className="mt-0.5 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                          <span>{formatTokenCount(model.contextLength)} ctx</span>
                          <span aria-hidden>·</span>
                          <span>{formatTokenCount(model.maxOutput)} out</span>
                          <span aria-hidden>·</span>
                          <span>{formatModelPrice(model)}</span>
                        </span>
                      </span>
                    </Button>
                  );
                })}
              </section>
            ))}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
