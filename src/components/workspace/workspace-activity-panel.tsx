"use client";

import type { AgentRunSnapshot } from "@/lib/desktop-api";
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
import type { AgentRun, AgentRunStatus } from "@/lib/workspace";
import { hasEventType, useWorkspaceEvents } from "@/hooks/use-workspace-events";
import { ActivityIcon, ChevronLeftIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

type WorkspaceActivityPanelProps = {
  workspaceId: string;
};

const STATUS_LABELS: Record<AgentRunStatus, string> = {
  queued: "در صف",
  running: "در حال اجرا",
  awaiting_approval: "در انتظار تأیید",
  completed: "تکمیل‌شده",
  failed: "ناموفق",
  cancelled: "لغو شده",
};

const STATUS_VARIANTS: Record<
  AgentRunStatus,
  "default" | "secondary" | "destructive" | "outline"
> = {
  queued: "outline",
  running: "secondary",
  awaiting_approval: "default",
  completed: "outline",
  failed: "destructive",
  cancelled: "outline",
};

const TOOL_STATUS_LABELS: Record<string, string> = {
  queued: "در صف",
  running: "در حال اجرا",
  awaiting_approval: "در انتظار تأیید",
  completed: "انجام شد",
  failed: "ناموفق",
  denied: "رد شد",
};

function formatDate(timestamp: number): string {
  return new Intl.DateTimeFormat("fa-IR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(timestamp));
}

function prettyJson(json: string | null): string | null {
  if (!json) return null;
  try {
    return JSON.stringify(JSON.parse(json), null, 2);
  } catch {
    return json;
  }
}

function ToolCallDetail({
  label,
  json,
}: {
  label: string;
  json: string | null;
}) {
  const pretty = prettyJson(json);
  if (!pretty) return null;
  return (
    <div className="mt-1">
      <span className="text-[10px] text-muted-foreground">{label}</span>
      <pre
        dir="ltr"
        className="mt-0.5 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded border border-border/30 bg-muted/20 p-1.5 text-left text-[11px] leading-4"
      >
        {pretty}
      </pre>
    </div>
  );
}

export function WorkspaceActivityPanel({
  workspaceId,
}: WorkspaceActivityPanelProps) {
  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selected, setSelected] = useState<AgentRunSnapshot | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await window.desktop.storage.listAgentRuns({
        workspaceId,
        limit: 50,
      });
      setRuns(result);
    } catch (error) {
      console.error("Failed to load agent runs:", error);
    } finally {
      setIsLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    setSelected(null);
    void load();
  }, [workspaceId, load]);

  const refreshSelected = useCallback((runId: string) => {
    void window.desktop.storage
      .getAgentRun(runId)
      .then((snapshot) => {
        if (snapshot) setSelected(snapshot);
      })
      .catch((error) => console.error("Failed to refresh agent run:", error));
  }, []);

  useWorkspaceEvents(workspaceId, (events) => {
    if (!hasEventType(events, "run-changed", "approval-changed")) return;
    void load();
    setSelected((current) => {
      if (current) refreshSelected(current.run.id);
      return current;
    });
  });

  function handleSelect(run: AgentRun) {
    void window.desktop.storage.getAgentRun(run.id).then(setSelected).catch((error) => {
      console.error("Failed to load agent run:", error);
    });
  }

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (selected) {
    return (
      <div dir="rtl" className="flex h-full min-h-0 flex-col gap-2">
        <div className="flex items-center gap-2 px-1">
          <Button size="icon-sm" variant="ghost" onClick={() => setSelected(null)}>
            <ChevronLeftIcon />
          </Button>
          <p className="min-w-0 flex-1 truncate text-sm font-medium" dir="ltr">
            {selected.run.model}
          </p>
          <Badge variant={STATUS_VARIANTS[selected.run.status]}>
            {STATUS_LABELS[selected.run.status]}
          </Badge>
        </div>
        <ScrollArea className="min-h-0 flex-1">
          <div className="flex flex-col gap-3 pe-2">
            {selected.run.error ? (
              <p className="rounded-lg border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive">
                {selected.run.error}
              </p>
            ) : null}

            {selected.approvals.length > 0 ? (
              <div className="flex flex-col gap-1.5">
                <p className="text-[11px] font-medium text-muted-foreground">
                  درخواست‌های تأیید
                </p>
                {selected.approvals.map((approval) => (
                  <div
                    key={approval.id}
                    className="rounded-lg border border-border/40 px-2 py-1.5 text-xs"
                  >
                    <p dir="ltr" className="font-mono">{approval.toolName}</p>
                    <p className="text-muted-foreground">{approval.reason}</p>
                    <p className="mt-0.5">
                      وضعیت:{" "}
                      {approval.decision === "pending"
                        ? "در انتظار"
                        : approval.decision === "approved"
                          ? "تأیید شد"
                          : "رد شد"}
                    </p>
                  </div>
                ))}
              </div>
            ) : null}

            <div className="flex flex-col gap-1.5">
              <p className="text-[11px] font-medium text-muted-foreground">
                فراخوانی ابزارها ({selected.toolCalls.length.toLocaleString("fa-IR")})
              </p>
              {selected.toolCalls.map((toolCall) => (
                <details
                  key={toolCall.id}
                  className="rounded-lg border border-border/40 px-2 py-1.5 text-xs"
                >
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-2">
                    <span dir="ltr" className="truncate font-mono">
                      {toolCall.toolName}
                    </span>
                    <Badge
                      variant={
                        toolCall.status === "failed" ||
                        toolCall.status === "denied"
                          ? "destructive"
                          : "outline"
                      }
                      className="h-4 shrink-0"
                    >
                      {TOOL_STATUS_LABELS[toolCall.status] ?? toolCall.status}
                    </Badge>
                  </summary>
                  {toolCall.error ? (
                    <p className="mt-1 text-destructive">{toolCall.error}</p>
                  ) : null}
                  <ToolCallDetail label="ورودی" json={toolCall.inputJson} />
                  <ToolCallDetail label="خروجی" json={toolCall.outputJson} />
                </details>
              ))}
              {selected.toolCalls.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  این اجرا ابزاری فراخوانی نکرد.
                </p>
              ) : null}
            </div>

            {selected.steps.length > 0 ? (
              <div className="flex flex-col gap-1">
                <p className="text-[11px] font-medium text-muted-foreground">
                  مراحل ({selected.steps.length.toLocaleString("fa-IR")})
                </p>
                <ol className="flex flex-col gap-1">
                  {selected.steps.map((step) => (
                    <li
                      key={step.id}
                      className="flex items-center gap-2 rounded-md border border-border/30 px-2 py-1 text-[11px] text-muted-foreground"
                    >
                      <span className="size-1.5 shrink-0 rounded-full bg-primary/50" />
                      <span className="min-w-0 flex-1 truncate">{step.summary}</span>
                    </li>
                  ))}
                </ol>
              </div>
            ) : null}
          </div>
        </ScrollArea>
      </div>
    );
  }

  if (runs.length === 0) {
    return (
      <Empty className="h-full border-0 p-6">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <ActivityIcon />
          </EmptyMedia>
          <EmptyTitle>فعالیتی ثبت نشده</EmptyTitle>
          <EmptyDescription>
            اجرای دستیار برای این فضای کاری اینجا نمایش داده می‌شود.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <ScrollArea dir="rtl" className="h-full min-h-0">
      <ul className="flex flex-col gap-1.5 pe-2">
        {runs.map((run) => (
          <li key={run.id}>
            <button
              type="button"
              onClick={() => handleSelect(run)}
              className="flex w-full items-center gap-2 rounded-xl border border-border/50 px-2.5 py-2 text-right hover:bg-muted/40"
            >
              <div className="flex min-w-0 flex-1 flex-col items-start gap-0.5">
                <span dir="ltr" className="max-w-full truncate text-sm font-medium">
                  {run.model}
                </span>
                <span className="text-xs text-muted-foreground">
                  {formatDate(run.startedAt)} · {run.stepCount} مرحله
                </span>
              </div>
              <Badge variant={STATUS_VARIANTS[run.status]}>
                {STATUS_LABELS[run.status]}
              </Badge>
            </button>
          </li>
        ))}
      </ul>
    </ScrollArea>
  );
}
