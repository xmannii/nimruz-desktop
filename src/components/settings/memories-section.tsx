"use client";

import { useAppShell } from "@/components/app-shell-context";
import { SettingsSection } from "@/components/settings/settings-section";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  MEMORY_CATEGORY_LABELS,
  MEMORY_LIMITS,
} from "@/lib/settings/memories";
import { BrainIcon, Trash2Icon } from "lucide-react";

export function MemoriesSettingsSection() {
  const { memories, handleDeleteMemory } = useAppShell();

  return (
    <SettingsSection
      title="خاطره‌های ذخیره‌شده"
      description={`دستیار می‌تواند در گفتگو خاطره ذخیره کند. حداکثر ${MEMORY_LIMITS.maxEntries.toLocaleString("fa-IR")} مورد.`}
      icon={BrainIcon}
    >
      {memories.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border px-4 py-12 text-center">
          <span className="flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <BrainIcon className="size-4" />
          </span>
          <p className="text-sm font-medium text-foreground">
            هنوز خاطره‌ای ندارید
          </p>
          <p className="max-w-sm text-xs leading-5 text-muted-foreground">
            وقتی در گفتگو از دستیار بخواهید چیزی را به خاطر بسپارد، اینجا نمایش
            داده می‌شود.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {memories.map((memory) => (
            <div
              key={memory.id}
              dir="rtl"
              className="group flex items-start gap-3 rounded-2xl border border-border/70 bg-muted/20 px-3.5 py-3"
            >
              <div className="min-w-0 flex-1">
                <div className="mb-1.5 flex items-center gap-2">
                  <Badge
                    variant="secondary"
                    className="h-5 px-1.5 text-[10px]"
                  >
                    {MEMORY_CATEGORY_LABELS[memory.category]}
                  </Badge>
                </div>
                <p className="text-sm leading-6 text-foreground">
                  {memory.content}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="shrink-0 text-muted-foreground opacity-70 transition-opacity group-hover:opacity-100 hover:text-destructive"
                aria-label="حذف خاطره"
                onClick={() => handleDeleteMemory(memory.id)}
              >
                <Trash2Icon />
              </Button>
            </div>
          ))}
        </div>
      )}
    </SettingsSection>
  );
}
