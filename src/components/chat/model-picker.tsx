"use client";

import { useAppShell } from "@/components/app-shell-context";
import { Anthropic, DeepSeek, OpenAI } from "@/components/provider-logos";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { ModelConfig, ProviderModelRef } from "@/lib/models/catalog";
import { formatModelPrice, formatTokenCount } from "@/lib/models";
import { cn } from "@/lib/utils";
import { Link } from "@tanstack/react-router";
import { CheckIcon, ChevronDownIcon, Settings2Icon } from "lucide-react";
import { useMemo, useState } from "react";

type ModelPickerProps = {
  value: ProviderModelRef;
  onValueChange: (value: ProviderModelRef) => void;
  disabled?: boolean;
  compact?: boolean;
};

function ProviderAvatar({
  name,
  className,
}: {
  name: string;
  className?: string;
}) {
  const lower = name.toLowerCase();
  if (lower.includes("deepseek")) {
    return (
      <span className={cn("flex size-7 items-center justify-center rounded-md bg-[#4D6BFE]/10", className)}>
        <DeepSeek className="size-4" />
      </span>
    );
  }
  if (lower.includes("anthropic") || lower.includes("claude")) {
    return (
      <span className={cn("flex size-7 items-center justify-center rounded-md bg-[#D97757]", className)}>
        <Anthropic className="size-4" />
      </span>
    );
  }
  if (lower.includes("openai") || lower.includes("gpt")) {
    return (
      <span className={cn("flex size-7 items-center justify-center rounded-md bg-[#111]", className)}>
        <OpenAI className="size-4" />
      </span>
    );
  }
  return (
    <span
      className={cn(
        "flex size-7 items-center justify-center rounded-md bg-muted text-[10px] font-medium uppercase text-muted-foreground",
        className
      )}
    >
      {name.slice(0, 2)}
    </span>
  );
}

function modelKey(model: Pick<ModelConfig, "providerId" | "modelId">) {
  return `${model.providerId}::${model.modelId}`;
}

export function ModelPicker({
  value,
  onValueChange,
  disabled = false,
  compact = false,
}: ModelPickerProps) {
  const [open, setOpen] = useState(false);
  const { enabledModelGroups, resolveModel } = useAppShell();
  const selected = resolveModel(value);

  const groups = useMemo(() => enabledModelGroups, [enabledModelGroups]);

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
          <ProviderAvatar
            name={selected.fullName}
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
          <div className="flex flex-col gap-1 p-1.5" dir="ltr">
            {groups.length === 0 ? (
              <div className="px-3 py-8 text-center text-xs text-muted-foreground" dir="rtl">
                مدلی فعال نیست. از تنظیمات مدل‌ها یکی را فعال کنید.
              </div>
            ) : (
              groups.map((group) => (
                <section key={group.provider.id}>
                  <div className="px-2 pb-1 pt-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    {group.provider.name}
                  </div>
                  {group.models.map((model) => {
                    const isSelected =
                      modelKey(model) === modelKey(value);

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
                          onValueChange({
                            providerId: model.providerId,
                            modelId: model.modelId,
                          });
                          setOpen(false);
                        }}
                      >
                        <ProviderAvatar name={model.fullName} />
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
                            {model.contextLength > 0 ? (
                              <>
                                <span>
                                  {formatTokenCount(model.contextLength)} ctx
                                </span>
                                <span aria-hidden>·</span>
                              </>
                            ) : null}
                            {model.maxOutput > 0 ? (
                              <>
                                <span>
                                  {formatTokenCount(model.maxOutput)} out
                                </span>
                                <span aria-hidden>·</span>
                              </>
                            ) : null}
                            <span>
                              {formatModelPrice({
                                id: model.modelId,
                                name: model.name,
                                fullName: model.fullName,
                                provider: "openai",
                                description: model.description,
                                contextLength: model.contextLength,
                                maxOutput: model.maxOutput,
                                inputPricePerM: model.inputPricePerM,
                                outputPricePerM: model.outputPricePerM,
                                supportsImages: model.supportsImages,
                                supportsReasoningEffort:
                                  model.supportsReasoningEffort,
                              })}
                            </span>
                          </span>
                        </span>
                      </Button>
                    );
                  })}
                </section>
              ))
            )}
          </div>
        </ScrollArea>

        <div className="border-t border-border/60 p-1.5" dir="rtl">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="w-full justify-start"
            render={<Link to="/settings/models" />}
            onClick={() => setOpen(false)}
          >
            <Settings2Icon data-icon="inline-start" />
            مدیریت مدل‌ها
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
