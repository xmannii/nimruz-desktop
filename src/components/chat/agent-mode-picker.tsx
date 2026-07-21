"use client";

import {
  AGENT_MODE_LABELS,
  type AgentMode,
} from "@/lib/chat/agent-mode";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
  BotIcon,
  CheckIcon,
  ChevronDownIcon,
  ListTodoIcon,
  MessageCircleIcon,
} from "lucide-react";
import { useState, type ComponentType } from "react";

type AgentModePickerProps = {
  value: AgentMode;
  onValueChange: (mode: AgentMode) => void;
  disabled?: boolean;
  compact?: boolean;
};

const MODE_OPTIONS: {
  id: AgentMode;
  description: string;
  icon: ComponentType<{ className?: string }>;
}[] = [
  {
    id: "general",
    description: "کار کن، کدنویسی کن، از ابزارها استفاده کن",
    icon: BotIcon,
  },
  {
    id: "plan",
    description: "سوال بپرس، تحقیق کن، پلن بساز",
    icon: ListTodoIcon,
  },
  {
    id: "chat",
    description: "فقط گفتگو، بدون ابزار یا زمینهٔ فضای کاری",
    icon: MessageCircleIcon,
  },
];

export function AgentModePicker({
  value,
  onValueChange,
  disabled = false,
  compact = false,
}: AgentModePickerProps) {
  const [open, setOpen] = useState(false);
  const selected =
    MODE_OPTIONS.find((option) => option.id === value) ?? MODE_OPTIONS[0];
  const SelectedIcon = selected.icon;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        disabled={disabled}
        className={cn(
          "inline-flex items-center rounded-full border border-border/70 bg-muted/70 text-xs font-medium text-foreground shadow-none transition-colors hover:bg-muted focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50",
          compact
            ? "h-10 max-w-[7.5rem] shrink gap-1 px-2"
            : "h-8 gap-1.5 px-2",
          open && "bg-muted",
          value === "plan" && "border-primary/30 bg-primary/10"
        )}
        aria-label={`حالت ایجنت: ${AGENT_MODE_LABELS[value]}`}
      >
        <SelectedIcon
          className={cn("shrink-0", compact ? "size-3.5" : "size-3.5")}
        />
        <span className={cn("min-w-0 truncate", compact && "text-[11px]")}>
          {AGENT_MODE_LABELS[value]}
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
        className="w-56 gap-0 overflow-hidden rounded-xl p-1"
      >
        <div dir="rtl" className="flex flex-col gap-0.5">
          {MODE_OPTIONS.map((option) => {
            const Icon = option.icon;
            const isActive = option.id === value;
            return (
              <button
                key={option.id}
                type="button"
                className={cn(
                  "flex w-full items-start gap-2 rounded-lg px-2 py-2 text-start transition-colors",
                  "hover:bg-muted",
                  isActive && "bg-muted/70"
                )}
                onClick={() => {
                  onValueChange(option.id);
                  setOpen(false);
                }}
              >
                <Icon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1">
                  <span className="block text-xs font-medium">
                    {AGENT_MODE_LABELS[option.id]}
                  </span>
                  <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">
                    {option.description}
                  </span>
                </span>
                {isActive ? (
                  <CheckIcon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                ) : null}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
