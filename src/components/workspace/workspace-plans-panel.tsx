"use client";

import { MessageResponse } from "@/components/ai-elements/message";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Spinner } from "@/components/ui/spinner";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import type { PlanRecord, PlanStatus } from "@/lib/workspace";
import { hasEventType, useWorkspaceEvents } from "@/hooks/use-workspace-events";
import {
  CheckCircle2Icon,
  CircleIcon,
  CircleDashedIcon,
  LoaderCircleIcon,
  ListTodoIcon,
  OctagonAlertIcon,
  Trash2Icon,
  XCircleIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

type WorkspacePlansPanelProps = {
  workspaceId: string;
  revealPlanId?: string | null;
  onRevealHandled?: () => void;
};

const STATUS_LABELS: Record<PlanStatus, string> = {
  active: "فعال",
  completed: "تکمیل‌شده",
  draft: "پیش‌نویس",
  cancelled: "لغو‌شده",
};

const STATUS_ORDER: PlanStatus[] = [
  "active",
  "draft",
  "completed",
  "cancelled",
];

function StatusBadge({ status }: { status: PlanStatus }) {
  const variant =
    status === "active"
      ? "default"
      : status === "completed"
        ? "secondary"
        : status === "cancelled"
          ? "outline"
          : "secondary";
  return (
    <Badge variant={variant} className="h-5 px-1.5 text-[10px] font-normal">
      {STATUS_LABELS[status]}
    </Badge>
  );
}

function StatusIcon({ status }: { status: PlanStatus }) {
  if (status === "completed") {
    return <CheckCircle2Icon className="size-3.5 text-emerald-500" />;
  }
  if (status === "cancelled") {
    return <XCircleIcon className="size-3.5 text-muted-foreground" />;
  }
  if (status === "active") {
    return <CircleDashedIcon className="size-3.5 text-amber-500" />;
  }
  return <CircleDashedIcon className="size-3.5 text-muted-foreground" />;
}

function StepIcon({ status }: { status: PlanRecord["steps"][number]["status"] }) {
  if (status === "completed") {
    return <CheckCircle2Icon className="text-primary" />;
  }
  if (status === "in_progress") {
    return <LoaderCircleIcon className="animate-spin text-primary" />;
  }
  if (status === "blocked") {
    return <OctagonAlertIcon className="text-destructive" />;
  }
  return <CircleIcon className="text-muted-foreground" />;
}

export function WorkspacePlansPanel({
  workspaceId,
  revealPlanId = null,
  onRevealHandled,
}: WorkspacePlansPanelProps) {
  const [plans, setPlans] = useState<PlanRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = useCallback(async (background = false) => {
    if (!background) setIsLoading(true);
    try {
      const result = await window.desktop.storage.listPlans(workspaceId);
      const sorted = result.sort((a, b) => {
        const orderDiff =
          STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status);
        if (orderDiff !== 0) return orderDiff;
        return b.updatedAt - a.updatedAt;
      });
      setPlans(sorted);
      setSelectedId((current) => {
        if (current && sorted.some((plan) => plan.id === current)) {
          return current;
        }
        const active = sorted.find((plan) => plan.status === "active");
        return active?.id ?? sorted[0]?.id ?? null;
      });
    } catch (error) {
      console.error("Failed to load plans:", error);
    } finally {
      if (!background) setIsLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    void load(false);
  }, [workspaceId, load]);

  useWorkspaceEvents(workspaceId, (events) => {
    if (hasEventType(events, "plan-changed")) void load(true);
  });

  useEffect(() => {
    if (!revealPlanId) return;
    setSelectedId(revealPlanId);
    onRevealHandled?.();
  }, [revealPlanId, onRevealHandled]);

  const selected = useMemo(
    () => plans.find((plan) => plan.id === selectedId) ?? null,
    [plans, selectedId]
  );

  const stepStats = useMemo(() => {
    const total = selected?.steps.length ?? 0;
    const done = selected?.steps.filter((step) => step.status === "completed").length ?? 0;
    return { total, done, percentage: total > 0 ? (done / total) * 100 : 0 };
  }, [selected]);

  function handleDelete(plan: PlanRecord) {
    setPlans((current) => current.filter((item) => item.id !== plan.id));
    if (selectedId === plan.id) {
      setSelectedId(null);
    }
    void window.desktop.storage.deletePlan(plan.id).catch((error) => {
      console.error("Failed to delete plan:", error);
    });
  }

  function handleStatusChange(status: PlanStatus) {
    if (!selected || selected.status === status) return;
    const updated: PlanRecord = {
      ...selected,
      status,
      updatedAt: Date.now(),
    };
    setPlans((current) =>
      current.map((item) => (item.id === updated.id ? updated : item))
    );
    void window.desktop.storage.savePlan(updated).catch((error) => {
      console.error("Failed to update plan status:", error);
    });
  }

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (plans.length === 0) {
    return (
      <Empty className="flex-1 border-0 p-6">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <ListTodoIcon />
          </EmptyMedia>
          <EmptyTitle>هنوز پلنی ثبت نشده</EmptyTitle>
          <EmptyDescription>
            در حالت پلن از کامپوزر، ایجنت تحقیق می‌کند و پلن را اینجا ذخیره می‌کند.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div dir="rtl" className="flex h-full min-h-0 flex-col gap-2">
      <ScrollArea className="max-h-40 shrink-0">
        <ul className="flex flex-col gap-1 pe-2">
          {plans.map((plan) => {
            const isSelected = plan.id === selectedId;
            return (
              <li key={plan.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(plan.id)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-lg border px-2 py-1.5 text-start transition-colors",
                    isSelected
                      ? "border-primary/30 bg-primary/10"
                      : "border-border/40 hover:bg-muted/50"
                  )}
                >
                  <StatusIcon status={plan.status} />
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {plan.title}
                  </span>
                  <StatusBadge status={plan.status} />
                </button>
              </li>
            );
          })}
        </ul>
      </ScrollArea>

      {selected ? (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border/50 bg-background/40">
          <div className="flex shrink-0 items-start gap-2 border-b border-border/50 px-3 py-2">
            <div className="min-w-0 flex-1">
              <h3 className="truncate text-sm font-semibold">{selected.title}</h3>
              {stepStats.total > 0 ? (
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {stepStats.done.toLocaleString("fa-IR")} از{" "}
                  {stepStats.total.toLocaleString("fa-IR")} مرحله انجام شده
                </p>
              ) : null}
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {selected.status !== "completed" ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-[11px]"
                  onClick={() => handleStatusChange("completed")}
                  disabled={stepStats.total > 0 && stepStats.done < stepStats.total}
                >
                  تکمیل
                </Button>
              ) : null}
              {selected.status === "active" ? null : (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-[11px]"
                  onClick={() => handleStatusChange("active")}
                >
                  فعال‌سازی
                </Button>
              )}
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                className="size-7 text-muted-foreground"
                aria-label="حذف پلن"
                onClick={() => handleDelete(selected)}
              >
                <Trash2Icon className="size-3.5" />
              </Button>
            </div>
          </div>

          <ScrollArea className="min-h-0 flex-1">
            <div className="flex flex-col gap-4 px-3 py-3">
              <MessageResponse className="text-sm leading-7">
                {selected.markdown}
              </MessageResponse>
              {stepStats.total > 0 ? (
                <section className="flex flex-col gap-2" aria-label="مراحل اجرا">
                  <Progress value={stepStats.percentage} className="gap-0" />
                  <ol className="flex flex-col gap-1.5">
                    {selected.steps.map((step, index) => (
                      <li
                        key={step.id}
                        className="flex items-start gap-2 rounded-lg bg-muted/35 px-2.5 py-2"
                      >
                        <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center">
                          <StepIcon status={step.status} />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="line-clamp-2 text-xs font-medium leading-5">
                            {`${(index + 1).toLocaleString("fa-IR")}. ${step.title}`}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ol>
                </section>
              ) : null}
            </div>
          </ScrollArea>
        </div>
      ) : null}
    </div>
  );
}
