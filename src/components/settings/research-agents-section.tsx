"use client";

import { useAppShell } from "@/components/app-shell-context";
import { SettingsSection } from "@/components/settings/settings-section";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  SUBAGENT_MODEL_LIMITS,
  type SubagentModel,
} from "@/lib/settings/subagents";
import { BotIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { nanoid } from "nanoid";
import { useMemo } from "react";
import { toast } from "sonner";

export function ResearchAgentsSettingsSection() {
  const {
    providers,
    models,
    subagents,
    handleSubagentsChange,
  } = useAppShell();

  const availableModels = useMemo(() => {
    const enabledProviders = new Set(
      providers
        .filter((provider) => provider.enabled && provider.kind !== "codex")
        .map((provider) => provider.id)
    );
    return models.filter(
      (model) =>
        model.enabled &&
        model.supportsTools &&
        enabledProviders.has(model.providerId)
    );
  }, [models, providers]);

  function addModel() {
    const selectedRefs = new Set(
      subagents.map((item) => `${item.providerId}\0${item.modelId}`)
    );
    const model = availableModels.find(
      (item) => !selectedRefs.has(`${item.providerId}\0${item.modelId}`)
    );
    if (!model) {
      toast.message("مدل ابزارمحور دیگری برای افزودن وجود ندارد");
      return;
    }

    handleSubagentsChange([
      ...subagents,
      {
        id: nanoid(),
        providerId: model.providerId,
        modelId: model.modelId,
        description: "",
        enabled: true,
      },
    ]);
  }

  function updateModel(id: string, update: Partial<SubagentModel>) {
    handleSubagentsChange(
      subagents.map((item) =>
        item.id === id ? { ...item, ...update } : item
      )
    );
  }

  function removeModel(id: string) {
    handleSubagentsChange(subagents.filter((item) => item.id !== id));
  }

  const hasAvailableUnselectedModel = availableModels.some(
    (model) =>
      !subagents.some(
        (item) =>
          item.providerId === model.providerId &&
          item.modelId === model.modelId
      )
  );
  const enabledCount = subagents.filter((item) => item.enabled).length;

  return (
    <div className="flex flex-col gap-8">
      <SettingsSection
        title="دستیارهای پژوهشی"
        description="مدل‌هایی را انتخاب کنید که عامل اصلی برای بررسی عمیق سایت‌ها، مخزن‌ها و کدبیس‌های بزرگ به‌کار می‌گیرد. عامل اصلی بر اساس توضیح هر مدل، مناسب‌ترین دستیار را برای کار انتخاب می‌کند."
        icon={BotIcon}
      >
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            onClick={addModel}
            disabled={
              subagents.length >= SUBAGENT_MODEL_LIMITS.maxEntries ||
              !hasAvailableUnselectedModel
            }
          >
            <PlusIcon data-icon="inline-start" />
            افزودن مدل
          </Button>
          <Badge variant={enabledCount > 0 ? "secondary" : "outline"}>
            {enabledCount > 0
              ? `${enabledCount.toLocaleString("fa-IR")} دستیار فعال`
              : "غیرفعال"}
          </Badge>
        </div>

        <p className="mt-3 text-xs leading-5 text-muted-foreground">
          اگر هیچ مدلی فعال نباشد، عامل اصلی پژوهش را خودش انجام می‌دهد. فقط
          مدل‌های فعالِ دارای پشتیبانی ابزار نمایش داده می‌شوند.
        </p>

        <div className="mt-4 flex flex-col gap-3">
          {subagents.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
              هنوز دستیار پژوهشی تنظیم نشده است.
            </div>
          ) : (
            subagents.map((agent) => {
              const selectedModel = models.find(
                (model) =>
                  model.providerId === agent.providerId &&
                  model.modelId === agent.modelId
              );
              const selectedRefs = new Set(
                subagents
                  .filter((item) => item.id !== agent.id)
                  .map((item) => `${item.providerId}\0${item.modelId}`)
              );

              return (
                <div
                  key={agent.id}
                  className="rounded-2xl border border-border/70 bg-muted/15 p-3.5"
                >
                  <div className="flex items-center gap-2">
                    <Select
                      value={selectedModel?.id ?? null}
                      onValueChange={(value) => {
                        if (!value) return;
                        const model = models.find((item) => item.id === value);
                        if (model) {
                          updateModel(agent.id, {
                            providerId: model.providerId,
                            modelId: model.modelId,
                          });
                        }
                      }}
                    >
                      <SelectTrigger className="min-w-0 flex-1 rounded-xl">
                        <SelectValue>
                          {selectedModel?.fullName ?? agent.modelId}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent align="start">
                        {availableModels.map((model) => {
                          const ref = `${model.providerId}\0${model.modelId}`;
                          const provider = providers.find(
                            (item) => item.id === model.providerId
                          );
                          return (
                            <SelectItem
                              key={model.id}
                              value={model.id}
                              disabled={selectedRefs.has(ref)}
                            >
                              {provider?.name ?? model.providerId} ·{" "}
                              {model.fullName}
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                    <Switch
                      checked={agent.enabled}
                      onCheckedChange={(enabled) =>
                        updateModel(agent.id, { enabled })
                      }
                      aria-label={`فعال‌سازی ${selectedModel?.fullName ?? agent.modelId}`}
                    />
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      title="حذف"
                      onClick={() => removeModel(agent.id)}
                    >
                      <Trash2Icon />
                    </Button>
                  </div>
                  <Textarea
                    className="mt-3 min-h-20"
                    dir="rtl"
                    maxLength={SUBAGENT_MODEL_LIMITS.description}
                    value={agent.description}
                    placeholder="اختیاری: این مدل برای چه پژوهش‌هایی مناسب‌تر است؟ مثلاً تحلیل معماری مخزن‌های بزرگ"
                    onChange={(event) =>
                      updateModel(agent.id, {
                        description: event.target.value,
                      })
                    }
                  />
                </div>
              );
            })
          )}
        </div>
      </SettingsSection>
    </div>
  );
}
