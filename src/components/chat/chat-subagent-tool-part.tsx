"use client";

import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "@/components/ai-elements/reasoning";
import { MessageResponse } from "@/components/ai-elements/message";
import { ChatFetchUrlToolPart } from "@/components/chat/chat-web-tool-part";
import { ChatWorkspaceToolPart } from "@/components/chat/chat-workspace-tool-part";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import type { UIMessage } from "ai";
import {
  BotIcon,
  CheckIcon,
  ChevronLeftIcon,
  RefreshCwIcon,
  SearchIcon,
  TriangleAlertIcon,
  WrenchIcon,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

type SubagentRunMetadata = {
  status?: "running" | "retrying" | "completed" | "partial";
  attempt?: number;
  maxAttempts?: number;
  error?: string;
};

type SubagentToolPart = {
  type: "tool-spawn_subagent";
  state: string;
  preliminary?: boolean;
  input?: {
    task?: string;
    providerId?: string;
    modelId?: string;
  };
  output?: UIMessage;
  errorText?: string;
};

function LoadingDots() {
  return (
    <span className="flex items-center gap-1" aria-hidden>
      {[0, 1, 2].map((index) => (
        <span
          key={index}
          className="size-1.5 animate-bounce rounded-full bg-current"
          style={{ animationDelay: `${index * 120}ms` }}
        />
      ))}
    </span>
  );
}

function getRunMetadata(message: UIMessage | undefined): SubagentRunMetadata {
  const metadata = message?.metadata as
    | { subagent?: SubagentRunMetadata }
    | undefined;
  return metadata?.subagent ?? {};
}

function isIncompleteToolPart(part: UIMessage["parts"][number]): boolean {
  if (!part.type.startsWith("tool-")) return false;
  const state = (part as { state?: string }).state;
  return state === "input-streaming" || state === "input-available";
}

function getToolLabel(type: string): string {
  const labels: Record<string, string> = {
    "tool-fetch_url": "دریافت صفحه وب",
    "tool-list_files": "بررسی فایل‌ها",
    "tool-read_file": "خواندن فایل",
    "tool-search_files": "جست‌وجو در پروژه",
  };
  return labels[type] ?? type.replace(/^tool-/, "").replaceAll("_", " ");
}

function getToolDetail(part: UIMessage["parts"][number]): string | null {
  if (!part.type.startsWith("tool-")) return null;
  const input = (part as { input?: Record<string, unknown> }).input;
  if (!input) return null;
  const value = [input.path, input.query, input.url, input.pattern].find(
    (candidate) => typeof candidate === "string" && candidate.trim()
  );
  return typeof value === "string" ? value : null;
}

function InterruptedToolPart({
  part,
}: {
  part: UIMessage["parts"][number];
}) {
  return (
    <Alert variant="destructive">
      <TriangleAlertIcon />
      <AlertTitle>{getToolLabel(part.type)} متوقف شد</AlertTitle>
      <AlertDescription className="line-clamp-2 font-mono text-xs" dir="ltr">
        {getToolDetail(part) ??
          "The stream ended before this tool returned a result."}
      </AlertDescription>
    </Alert>
  );
}

function renderNestedPart(
  part: UIMessage["parts"][number],
  index: number,
  isStreaming: boolean,
  workspaceId?: string | null
): ReactNode {
  const key = `${part.type}-${index}`;

  if (isIncompleteToolPart(part) && !isStreaming) {
    return <InterruptedToolPart key={key} part={part} />;
  }

  if (part.type === "text") {
    return (
      <div
        key={key}
        dir="rtl"
        className="rounded-2xl border border-border/60 bg-background px-4 py-3 text-sm leading-7"
      >
        <MessageResponse mode={isStreaming ? "streaming" : "static"}>
          {part.text}
        </MessageResponse>
      </div>
    );
  }

  if (part.type === "reasoning") {
    return (
      <Reasoning key={key} isStreaming={isStreaming} className="mb-0">
        <ReasoningTrigger />
        <ReasoningContent mode={isStreaming ? "streaming" : "static"}>
          {part.text ?? ""}
        </ReasoningContent>
      </Reasoning>
    );
  }

  if (part.type === "tool-fetch_url") {
    return <ChatFetchUrlToolPart key={key} part={part as never} />;
  }

  if (part.type.startsWith("tool-")) {
    return (
      <ChatWorkspaceToolPart
        key={key}
        workspaceId={workspaceId}
        part={
          part as unknown as {
            type: string;
            toolCallId: string;
            state: string;
            input?: Record<string, unknown>;
            output?: unknown;
            errorText?: string;
          }
        }
      />
    );
  }

  return null;
}

export function ChatSubagentToolPart({
  part,
  workspaceId,
}: {
  part: SubagentToolPart;
  workspaceId?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const hasOutput = part.state === "output-available";
  const transcript = part.output;
  const metadata = getRunMetadata(transcript);
  const isRetrying = metadata.status === "retrying";
  const metadataIsPartial = metadata.status === "partial";
  const isStreaming =
    metadata.status === "running" ||
    isRetrying ||
    part.state === "input-streaming" ||
    part.state === "input-available" ||
    (hasOutput && part.preliminary === true);
  const isError = part.state === "output-error";
  const canOpen = Boolean(transcript || isStreaming || isError);
  const modelLabel = part.input?.modelId ?? "research model";
  const stats = useMemo(() => {
    let toolCount = 0;
    let settledTools = 0;
    let activeTool: UIMessage["parts"][number] | undefined;

    for (const nestedPart of transcript?.parts ?? []) {
      if (!nestedPart.type.startsWith("tool-")) continue;
      toolCount += 1;
      const state = (nestedPart as { state?: string }).state;
      if (state === "output-available" || state === "output-error") {
        settledTools += 1;
      } else if (isIncompleteToolPart(nestedPart)) {
        activeTool = nestedPart;
      }
    }

    return {
      toolCount,
      settledTools,
      activeTool,
      progress: toolCount > 0 ? Math.round((settledTools / toolCount) * 100) : 0,
    };
  }, [transcript]);
  const isPartial =
    metadataIsPartial || (!isStreaming && Boolean(stats.activeTool));

  const status = isError
    ? "error"
    : isPartial
      ? "partial"
      : isRetrying
        ? "retrying"
        : isStreaming
          ? "running"
          : "completed";
  const statusLabel = {
    error: "ناموفق",
    partial: "گزارش ناقص",
    retrying: "تلاش دوباره",
    running: "در حال پژوهش",
    completed: "انجام شد",
  }[status];
  const statusDescription = isRetrying
    ? `تلاش ${metadata.attempt ?? 2} از ${metadata.maxAttempts ?? 2}`
    : stats.activeTool
      ? `${getToolLabel(stats.activeTool.type)}${
          getToolDetail(stats.activeTool)
            ? ` · ${getToolDetail(stats.activeTool)}`
            : ""
        }`
      : isStreaming
        ? "در حال تحلیل و جمع‌بندی شواهد"
        : isPartial
          ? "نتیجه‌های به‌دست‌آمده تا پیش از توقف حفظ شده‌اند"
          : `${stats.settledTools} عملیات ابزار تکمیل شد`;

  useEffect(() => {
    if (!open || !isStreaming) return;
    const element = transcriptRef.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [isStreaming, open, transcript]);

  return (
    <>
      <button
        type="button"
        dir="rtl"
        disabled={!canOpen}
        onClick={() => setOpen(true)}
        className={cn(
          "group flex w-full flex-col gap-3 rounded-2xl border border-border/60 bg-card/60 p-3 text-right transition-colors",
          canOpen && "hover:border-border hover:bg-muted/30",
          !canOpen && "cursor-default"
        )}
      >
        <span className="flex w-full items-start gap-3">
          <span
            className={cn(
              "flex size-9 shrink-0 items-center justify-center rounded-xl border bg-background shadow-xs",
              (isError || isPartial) &&
                "border-destructive/30 bg-destructive/5 text-destructive"
            )}
          >
            {isError || isPartial ? (
              <TriangleAlertIcon className="size-4" />
            ) : isRetrying ? (
              <RefreshCwIcon className="size-4 animate-spin" />
            ) : isStreaming ? (
              <BotIcon className="size-4" />
            ) : (
              <CheckIcon className="size-4 text-emerald-600" />
            )}
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center justify-between gap-2">
              <span className="truncate text-sm font-medium text-foreground">
                دستیار پژوهشی
              </span>
              <Badge
                variant={
                  isError || isPartial
                    ? "destructive"
                    : isStreaming
                      ? "secondary"
                      : "outline"
                }
              >
                {isStreaming && !isRetrying ? (
                  <Spinner data-icon="inline-start" />
                ) : isRetrying ? (
                  <RefreshCwIcon data-icon="inline-start" />
                ) : null}
                {statusLabel}
              </Badge>
            </span>
            <span className="mt-0.5 block truncate text-xs text-muted-foreground">
              {modelLabel}
              {stats.toolCount > 0
                ? ` · ${stats.settledTools} از ${stats.toolCount} ابزار`
                : ""}
            </span>
          </span>
        </span>

        <span className="flex w-full items-center gap-2 text-xs text-muted-foreground">
          {stats.activeTool ? (
            <WrenchIcon className="size-3.5 shrink-0" />
          ) : (
            <SearchIcon className="size-3.5 shrink-0" />
          )}
          <span className="min-w-0 flex-1 truncate">{statusDescription}</span>
          {canOpen ? (
            <ChevronLeftIcon className="size-3.5 shrink-0 transition-transform group-hover:-translate-x-0.5" />
          ) : null}
        </span>

        {isStreaming && stats.toolCount > 0 ? (
          <Progress
            value={stats.progress}
            aria-label={`${stats.settledTools} of ${stats.toolCount} tools completed`}
            className="w-full gap-0 [&_[data-slot=progress-track]]:h-1.5"
          />
        ) : null}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          dir="rtl"
          className="flex max-h-[85vh] w-full flex-col gap-4 overflow-hidden p-0 sm:max-w-3xl"
        >
          <DialogHeader className="border-b border-border/60 px-6 pt-6 pb-4 text-right">
            <div className="flex items-center justify-between gap-3 pl-8">
              <DialogTitle>گزارش دستیار پژوهشی</DialogTitle>
              <Badge
                variant={
                  isError || isPartial
                    ? "destructive"
                    : isStreaming
                      ? "secondary"
                      : "outline"
                }
              >
                {isStreaming ? <Spinner data-icon="inline-start" /> : null}
                {statusLabel}
              </Badge>
            </div>
            <DialogDescription className="line-clamp-2">
              {part.input?.task ?? `مدل ${modelLabel}`}
            </DialogDescription>
            <div className="flex items-center gap-2 pt-1 text-xs text-muted-foreground">
              <BotIcon className="size-3.5" />
              <span>{modelLabel}</span>
              {stats.toolCount > 0 ? (
                <span>
                  · {stats.settledTools} از {stats.toolCount} ابزار تکمیل شده
                </span>
              ) : null}
            </div>
          </DialogHeader>

          <div
            ref={transcriptRef}
            aria-live="polite"
            dir="rtl"
            className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-6 pb-6 text-right"
          >
            {isError ? (
              <Alert variant="destructive">
                <TriangleAlertIcon />
                <AlertTitle>اجرای دستیار ناموفق بود</AlertTitle>
                <AlertDescription>
                  {part.errorText ?? "اجرای دستیار پژوهشی ناموفق بود."}
                </AlertDescription>
              </Alert>
            ) : transcript?.parts.length ? (
              <>
                {isPartial ? (
                  <Alert variant="destructive">
                    <TriangleAlertIcon />
                    <AlertTitle>پژوهش زودتر از انتظار متوقف شد</AlertTitle>
                    <AlertDescription>
                      {metadata.error ??
                        "نتیجه‌های موجود حفظ شده‌اند، اما گزارش ممکن است کامل نباشد."}
                    </AlertDescription>
                  </Alert>
                ) : null}
                {transcript.parts.map((nestedPart, index) =>
                  renderNestedPart(
                    nestedPart,
                    index,
                    isStreaming && index === transcript.parts.length - 1,
                    workspaceId
                  )
                )}
              </>
            ) : (
              <div
                dir="rtl"
                className="flex items-center justify-end gap-3 rounded-2xl border border-dashed border-border p-4 text-right text-sm text-muted-foreground"
              >
                دستیار پژوهشی در حال شروع بررسی است…
                <LoadingDots />
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
