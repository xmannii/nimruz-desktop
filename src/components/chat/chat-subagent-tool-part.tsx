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
import { cn } from "@/lib/utils";
import type { UIMessage } from "ai";
import {
  BotIcon,
  CheckIcon,
  ChevronLeftIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

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

function renderNestedPart(
  part: UIMessage["parts"][number],
  index: number,
  isStreaming: boolean,
  workspaceId?: string | null
): ReactNode {
  const key = `${part.type}-${index}`;

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
  const isStreaming =
    part.state === "input-streaming" ||
    part.state === "input-available" ||
    (hasOutput && part.preliminary === true);
  const isError = part.state === "output-error";
  const transcript = part.output;
  const canOpen = Boolean(transcript || isStreaming || isError);
  const modelLabel = part.input?.modelId ?? "research model";

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
          "flex min-h-9 w-full items-center gap-2 rounded-xl px-2.5 py-1.5 text-right text-xs text-muted-foreground transition-colors",
          canOpen && "hover:bg-muted/60 hover:text-foreground",
          !canOpen && "cursor-default"
        )}
      >
        <span className="flex size-6 shrink-0 items-center justify-center rounded-lg bg-muted">
          {isError ? (
            <TriangleAlertIcon className="size-3.5 text-destructive" />
          ) : isStreaming ? (
            <BotIcon className="size-3.5" />
          ) : (
            <CheckIcon className="size-3.5" />
          )}
        </span>
        <span
          className={cn(
            "min-w-0 flex-1 truncate",
            isError && "text-destructive"
          )}
        >
          {isError
            ? "پژوهش دستیار ناموفق بود"
            : isStreaming
              ? `دستیار پژوهشی ${modelLabel} در حال بررسی است`
              : `پژوهش دستیار ${modelLabel} انجام شد`}
        </span>
        {isStreaming ? (
          <LoadingDots />
        ) : canOpen ? (
          <ChevronLeftIcon className="size-3.5" />
        ) : null}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          dir="rtl"
          className="flex max-h-[85vh] w-full flex-col gap-4 overflow-hidden p-0 sm:max-w-3xl"
        >
          <DialogHeader className="border-b border-border/60 px-6 pt-6 pb-4 text-right">
            <DialogTitle>گزارش زنده دستیار پژوهشی</DialogTitle>
            <DialogDescription className="line-clamp-2">
              {part.input?.task ?? `مدل ${modelLabel}`}
            </DialogDescription>
          </DialogHeader>

          <div
            ref={transcriptRef}
            aria-live="polite"
            dir="rtl"
            className="min-h-0 flex-1 space-y-3 overflow-y-auto px-6 pb-6 text-right"
          >
            {isError ? (
              <div
                dir="rtl"
                className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-right text-sm text-destructive"
              >
                {part.errorText ?? "اجرای دستیار پژوهشی ناموفق بود."}
              </div>
            ) : transcript?.parts.length ? (
              transcript.parts.map((nestedPart, index) =>
                renderNestedPart(
                  nestedPart,
                  index,
                  isStreaming && index === transcript.parts.length - 1,
                  workspaceId
                )
              )
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
