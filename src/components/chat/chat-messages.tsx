"use client";

import { Shimmer } from "@/components/ai-elements/shimmer";
import { MessageResponse } from "@/components/ai-elements/message";
import {
  ChatMessageActions,
  copyTextToClipboard,
} from "@/components/chat/chat-message-actions";
import { ChatMemoryToolPart } from "@/components/chat/chat-memory-tool-part";
import { ChatExpertToolPart } from "@/components/chat/chat-expert-tool-part";
import { ChatSkillToolPart } from "@/components/chat/chat-skill-tool-part";
import {
  ChatCompactToolBatch,
  COMPACT_TOOL_THRESHOLD,
  isPartError,
  isPartLoading,
  type CompactableToolPart,
} from "@/components/chat/chat-compact-tool-batch";
import {
  ChatToolInvocation,
  ChatToolStepGroup,
  type ToolStepCollapsedSummary,
} from "@/components/chat/chat-tool-invocation";
import { ChatFetchUrlToolPart } from "@/components/chat/chat-web-tool-part";
import { ChatWorkspaceToolPart } from "@/components/chat/chat-workspace-tool-part";
import { ChatSubagentToolPart } from "@/components/chat/chat-subagent-tool-part";
import { ToolApprovalCard } from "@/components/workspace/tool-approval-card";
import {
  Attachment,
  AttachmentContent,
  AttachmentDescription,
  AttachmentGroup,
  AttachmentMedia,
  AttachmentTitle,
} from "@/components/ui/attachment";
import { Bubble, BubbleContent, BubbleGroup } from "@/components/ui/bubble";
import { Marker, MarkerContent, MarkerIcon } from "@/components/ui/marker";
import { Message, MessageContent } from "@/components/ui/message";
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
  useMessageScroller,
} from "@/components/ui/message-scroller";
import { Spinner } from "@/components/ui/spinner";
import { getAssistantCopyText } from "@/lib/chat/message-text";
import type { ChatMessageMetadata } from "@/lib/chat/message";
import { fileExtension, type FileCategory } from "@/lib/workspace";
import { cn } from "@/lib/utils";
import type { ChatStatus, UIMessage } from "ai";
import { getChatErrorMessage } from "@/lib/chat/errors";
import {
  BrainIcon,
  FileCodeIcon,
  FileIcon,
  FileJsonIcon,
  FileTextIcon,
  ImageIcon,
  TableIcon,
  type LucideIcon,
} from "lucide-react";
import { memo, useEffect, useRef, useState, type ReactNode } from "react";

type ChatMessagesProps = {
  messages: UIMessage[];
  status: ChatStatus;
  error?: Error;
  isBusy?: boolean;
  onRegenerate?: (messageId: string) => void;
  onToolApprovalResponse?: ToolApprovalResponder;
  workspaceId?: string | null;
};

/**
 * Responds to a pending approval. When `options.always` is set the caller
 * also persists auto-approval for the tool's risk category going forward.
 */
type ToolApprovalResponder = (
  approvalId: string,
  approved: boolean,
  options?: { always?: boolean; toolType?: string }
) => void;

function ChatAutoScrollViewport({
  status,
  children,
}: {
  status: ChatStatus;
  children: ReactNode;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const isFollowingRef = useRef(true);
  const { scrollToEnd } = useMessageScroller();
  const isStreaming = status === "streaming";

  useEffect(() => {
    if (status === "submitted") {
      isFollowingRef.current = true;
      scrollToEnd({ behavior: "smooth" });
    }
  }, [status, scrollToEnd]);

  useEffect(() => {
    if (!isStreaming) return;

    const viewport = viewportRef.current;
    if (!viewport) return;

    const content = viewport.querySelector<HTMLElement>(
      '[data-slot="message-scroller-content"]'
    );
    if (!content || typeof ResizeObserver === "undefined") return;

    let frame = 0;

    const followContent = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (isFollowingRef.current) {
          viewport.scrollTop = Math.max(
            0,
            viewport.scrollHeight - viewport.clientHeight
          );
        }
      });
    };

    const observer = new ResizeObserver(followContent);
    observer.observe(content);
    followContent();

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [isStreaming]);

  function handleScroll() {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const distanceFromEnd =
      viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
    isFollowingRef.current = distanceFromEnd <= 64;
  }

  return (
    <MessageScrollerViewport
      ref={viewportRef}
      dir="rtl"
      onScroll={handleScroll}
    >
      {children}
    </MessageScrollerViewport>
  );
}

export function ChatMessages({
  messages,
  status,
  error,
  isBusy = false,
  onRegenerate,
  onToolApprovalResponse,
  workspaceId = null,
}: ChatMessagesProps) {
  return (
    <>
      <MessageScrollerProvider autoScroll={false} defaultScrollPosition="end">
        <MessageScroller className="flex-1">
          <ChatAutoScrollViewport status={status}>
            <MessageScrollerContent className="mx-auto w-full max-w-3xl gap-4 px-3 pt-14 pb-6 sm:px-6">
              {messages.map((message, messageIndex) => (
                <ChatMessageRow
                  key={message.id}
                  message={message}
                  isStreaming={
                    status === "streaming" &&
                    messageIndex === messages.length - 1 &&
                    message.role === "assistant"
                  }
                  isBusy={isBusy}
                  onRegenerate={onRegenerate}
                  onToolApprovalResponse={onToolApprovalResponse}
                  workspaceId={workspaceId}
                />
              ))}

              {status === "submitted" ? (
                <MessageScrollerItem scrollAnchor={false}>
                  <Marker role="status">
                    <MarkerIcon>
                      <Spinner />
                    </MarkerIcon>
                    <MarkerContent className="shimmer">
                      در حال فکر کردن…
                    </MarkerContent>
                  </Marker>
                </MessageScrollerItem>
              ) : null}
            </MessageScrollerContent>
          </ChatAutoScrollViewport>
          <MessageScrollerButton behavior="smooth" />
        </MessageScroller>
      </MessageScrollerProvider>

      {error ? (
        <p
          className="mx-auto w-full max-w-3xl px-3 pb-2 text-center text-sm text-destructive sm:px-6"
          role="alert"
          dir="ltr"
        >
          {getChatErrorMessage(error)}
        </p>
      ) : null}
    </>
  );
}

const ChatMessageRow = memo(function ChatMessageRow({
  message,
  isStreaming,
  isBusy,
  onRegenerate,
  onToolApprovalResponse,
  workspaceId,
}: {
  message: UIMessage;
  isStreaming: boolean;
  isBusy: boolean;
  onRegenerate?: (messageId: string) => void;
  onToolApprovalResponse?: ToolApprovalResponder;
  workspaceId?: string | null;
}) {
  const isUser = message.role === "user";

  return (
    <MessageScrollerItem messageId={message.id}>
      <Message
        align={isUser ? "end" : "start"}
        className={cn(
          "text-base",
          !isUser && "max-w-full flex-col items-stretch"
        )}
        dir="ltr"
      >
        <MessageContent className={cn(!isUser && "w-full max-w-full")}>
          {isUser ? (
            <UserMessageParts message={message} />
          ) : (
            <>
              <BubbleGroup className="w-full max-w-full gap-2">
                <AssistantMessageParts
                  message={message}
                  isStreaming={isStreaming}
                  onToolApprovalResponse={onToolApprovalResponse}
                  workspaceId={workspaceId}
                />
              </BubbleGroup>
              {!isStreaming ? (
                <ChatMessageActions
                  disabled={isBusy}
                  showCopy
                  showRegenerate={Boolean(onRegenerate)}
                  onCopy={() =>
                    void copyTextToClipboard(
                      getAssistantCopyText(message),
                      "پاسخ کپی شد."
                    )
                  }
                  onRegenerate={() => onRegenerate?.(message.id)}
                />
              ) : null}
            </>
          )}
        </MessageContent>
      </Message>
    </MessageScrollerItem>
  );
});

function UserMessageParts({ message }: { message: UIMessage }) {
  const metadata = message.metadata as ChatMessageMetadata | undefined;
  const docAttachments = metadata?.attachments ?? [];
  const imageParts = message.parts.filter(
    (part): part is Extract<UIMessage["parts"][number], { type: "file" }> =>
      part.type === "file" && Boolean(part.mediaType?.startsWith("image/"))
  );
  const refPaths = docAttachments.map((attachment) => attachment.relativePath);

  return (
    <div className="flex flex-col items-end gap-1.5">
      {imageParts.length > 0 ? (
        <div dir="rtl" className="flex flex-wrap justify-end gap-2">
          {imageParts.map((part, index) => (
            <a
              key={`${message.id}-image-${index}`}
              href={part.url}
              target="_blank"
              rel="noreferrer"
              className="block overflow-hidden rounded-xl border border-border/60 bg-muted/30 transition-opacity hover:opacity-90"
              title={part.filename ?? "تصویر"}
            >
              <img
                src={part.url}
                alt={part.filename ?? "تصویر"}
                className="max-h-72 w-auto max-w-full object-contain sm:max-h-80"
              />
            </a>
          ))}
        </div>
      ) : null}

      {docAttachments.length > 0 ? (
        <AttachmentGroup
          dir="rtl"
          className="justify-end"
          role="group"
          aria-label="پیوست‌ها"
        >
          {docAttachments.map((attachment, index) => {
            const Icon = iconForCategory(attachment.category);
            return (
              <Attachment
                key={`${message.id}-doc-${index}`}
                size="sm"
                state="done"
                className="min-w-40 max-w-64"
                title={attachment.name}
              >
                <AttachmentMedia>
                  <Icon />
                </AttachmentMedia>
                <AttachmentContent>
                  <AttachmentTitle>{attachment.name}</AttachmentTitle>
                  <AttachmentDescription>
                    {attachmentTypeLabel(attachment.category, attachment.name)}
                  </AttachmentDescription>
                </AttachmentContent>
              </Attachment>
            );
          })}
        </AttachmentGroup>
      ) : null}

      {message.parts.map((part, index) => {
        if (part.type !== "text") return null;
        const display = stripAttachmentRefs(part.text, refPaths);
        if (!display) return null;

        return (
          <Bubble
            key={`${message.id}-${index}`}
            align="end"
            variant="default"
          >
            <BubbleContent dir="rtl" className="text-base leading-7">
              <span className="whitespace-pre-wrap">{display}</span>
            </BubbleContent>
          </Bubble>
        );
      })}
    </div>
  );
}

/** Removes trailing `@path` reference tokens that map to shown attachments. */
function stripAttachmentRefs(text: string, paths: string[]): string {
  if (paths.length === 0) return text;
  let next = text;
  for (const path of paths) {
    const escaped = path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    next = next.replace(new RegExp(`(?:^|\\s)@${escaped}(?=\\s|$)`, "g"), " ");
  }
  return next.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

function attachmentTypeLabel(category: FileCategory, path: string): string {
  const ext = fileExtension(path);
  switch (category) {
    case "markdown":
      return "Markdown";
    case "code":
      return ext.toUpperCase() || "Code";
    case "csv":
      return "CSV";
    case "json":
      return "JSON";
    case "image":
      return ext.toUpperCase() || "Image";
    case "binary":
      return ext.toUpperCase() || "File";
    default:
      return "Text";
  }
}

function iconForCategory(category: FileCategory): LucideIcon {
  switch (category) {
    case "code":
      return FileCodeIcon;
    case "csv":
      return TableIcon;
    case "json":
      return FileJsonIcon;
    case "image":
      return ImageIcon;
    case "markdown":
    case "text":
      return FileTextIcon;
    default:
      return FileIcon;
  }
}

const STREAMING_TEXT_ANIMATION = {
  animation: "fadeIn",
  duration: 0.28,
  sep: "word" as const,
  stagger: 0.03,
};

function isManualApprovalPart(part: UIMessage["parts"][number]): boolean {
  if (!part.type.startsWith("tool-")) return false;
  if (!("approval" in part) || part.state !== "approval-requested") return false;
  const approval = (
    part as {
      approval?: { isAutomatic?: boolean };
    }
  ).approval;
  return !approval?.isAutomatic;
}

/** Tool parts that belong in the compact connected step timeline. */
function isStackableToolPart(part: UIMessage["parts"][number]): boolean {
  if (part.type === "reasoning") return false;
  if (!part.type.startsWith("tool-")) return false;
  if (part.type === "tool-spawn_subagent") return false;
  if (isManualApprovalPart(part)) return false;
  return true;
}

function renderCompactedToolRun(
  parts: UIMessage["parts"][number][],
  messageId: string,
  startIndex: number,
  workspaceId?: string | null
): ReactNode[] {
  if (parts.length >= COMPACT_TOOL_THRESHOLD) {
    return [
      <ChatCompactToolBatch
        key={`${messageId}-compact-${startIndex}`}
        parts={parts as CompactableToolPart[]}
      />,
    ];
  }

  return parts.map((part, offset) =>
    renderStackableToolPart(
      part,
      `${messageId}-${startIndex + offset}`,
      workspaceId
    )
  );
}

function renderStackableToolPart(
  part: UIMessage["parts"][number],
  key: string,
  workspaceId?: string | null
) {
  if (
    part.type === "tool-create_expert" ||
    part.type.startsWith("tool-expert_")
  ) {
    return (
      <ChatExpertToolPart
        key={key}
        part={
          part as {
            type: string;
            state: string;
            input?: { name?: string; slug?: string };
            output?: { success?: boolean; slug?: string };
          }
        }
      />
    );
  }

  if (
    part.type === "tool-save_memory" ||
    part.type === "tool-delete_memory"
  ) {
    return (
      <ChatMemoryToolPart
        key={key}
        part={
          part as Extract<
            UIMessage["parts"][number],
            { type: "tool-save_memory" | "tool-delete_memory" }
          >
        }
      />
    );
  }

  if (part.type === "tool-load_skill") {
    return (
      <ChatSkillToolPart
        key={key}
        part={
          part as Extract<
            UIMessage["parts"][number],
            { type: "tool-load_skill" }
          >
        }
      />
    );
  }

  if (part.type === "tool-fetch_url") {
    return (
      <ChatFetchUrlToolPart
        key={key}
        part={
          part as Extract<
            UIMessage["parts"][number],
            { type: "tool-fetch_url" }
          >
        }
      />
    );
  }

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

type TimelineReasoningSegment = {
  kind: "reasoning";
  index: number;
  text: string;
};

type TimelineToolsSegment = {
  kind: "tools";
  startIndex: number;
  parts: UIMessage["parts"][number][];
};

type TimelineSegment = TimelineReasoningSegment | TimelineToolsSegment;

function countTimelineSteps(timeline: TimelineSegment[]): number {
  let count = 0;
  for (const segment of timeline) {
    if (segment.kind === "reasoning") {
      count += 1;
      continue;
    }
    count +=
      segment.parts.length >= COMPACT_TOOL_THRESHOLD ? 1 : segment.parts.length;
  }
  return count;
}

function isTimelineActive(
  timeline: TimelineSegment[],
  isReasoningStreaming: boolean,
  lastPartIndex: number,
  isStreaming: boolean,
  hasFollowingContent: boolean
): boolean {
  const segmentActive = timeline.some((segment) => {
    if (segment.kind === "reasoning") {
      return isReasoningStreaming && segment.index === lastPartIndex;
    }
    return (segment.parts as CompactableToolPart[]).some(isPartLoading);
  });

  if (segmentActive) return true;

  // Keep the connected stack visible until text (or other content) follows.
  return isStreaming && !hasFollowingContent;
}

function timelineHasErrors(timeline: TimelineSegment[]): boolean {
  return timeline.some(
    (segment) =>
      segment.kind === "tools" &&
      (segment.parts as CompactableToolPart[]).some(isPartError)
  );
}

function buildTimelineCollapsedSummary(
  timeline: TimelineSegment[]
): ToolStepCollapsedSummary | undefined {
  const stepCount = countTimelineSteps(timeline);
  if (stepCount <= 1) return undefined;

  const hasError = timelineHasErrors(timeline);
  const stepLabel = stepCount.toLocaleString("fa-IR");

  return {
    isError: hasError,
    label: hasError ? `${stepLabel} مرحله · با خطا` : `${stepLabel} مرحله انجام شد`,
  };
}

function renderReasoningStep({
  messageId,
  index,
  text,
  isLoading,
  durationSeconds,
}: {
  messageId: string;
  index: number;
  text: string;
  isLoading: boolean;
  durationSeconds?: number;
}) {
  const hasText = text.trim().length > 0;

  return (
    <ChatToolInvocation
      key={`${messageId}-reasoning-${index}`}
      icon={<BrainIcon />}
      label={getReasoningThinkingMessage(isLoading, durationSeconds)}
      isLoading={isLoading}
      expandable={hasText && !isLoading}
      panelTitle="استدلال"
    >
      <pre
        dir="ltr"
        className="max-h-36 overflow-auto whitespace-pre-wrap break-words text-left text-[11px] leading-5 text-muted-foreground"
      >
        {text}
      </pre>
    </ChatToolInvocation>
  );
}

function AssistantMessageParts({
  message,
  isStreaming,
  onToolApprovalResponse,
  workspaceId,
}: {
  message: UIMessage;
  isStreaming: boolean;
  onToolApprovalResponse?: ToolApprovalResponder;
  workspaceId?: string | null;
}) {
  const lastPart = message.parts.at(-1);
  const lastPartIndex = message.parts.length - 1;
  const isReasoningStreaming =
    isStreaming && lastPart?.type === "reasoning";

  const [reasoningDurations, setReasoningDurations] = useState<
    Record<number, number>
  >({});
  const reasoningStartRef = useRef<{ index: number; startedAt: number } | null>(
    null
  );

  useEffect(() => {
    if (isReasoningStreaming && lastPartIndex >= 0) {
      if (
        reasoningStartRef.current === null ||
        reasoningStartRef.current.index !== lastPartIndex
      ) {
        reasoningStartRef.current = {
          index: lastPartIndex,
          startedAt: Date.now(),
        };
      }
      return;
    }

    if (reasoningStartRef.current !== null) {
      const { index, startedAt } = reasoningStartRef.current;
      const seconds = Math.max(1, Math.ceil((Date.now() - startedAt) / 1000));
      setReasoningDurations((current) =>
        current[index] === seconds ? current : { ...current, [index]: seconds }
      );
      reasoningStartRef.current = null;
    }
  }, [isReasoningStreaming, lastPartIndex]);

  const renderedParts: ReactNode[] = [];
  let timeline: TimelineSegment[] = [];
  let toolBuffer: UIMessage["parts"][number][] = [];
  let toolBufferStartIndex = 0;
  let timelineKey = "";

  const flushToolBuffer = () => {
    if (toolBuffer.length === 0) return;
    timeline.push({
      kind: "tools",
      startIndex: toolBufferStartIndex,
      parts: toolBuffer,
    });
    toolBuffer = [];
    toolBufferStartIndex = 0;
  };

  const flushTimeline = (hasFollowingContent = false) => {
    flushToolBuffer();
    if (timeline.length === 0) return;

    const steps: ReactNode[] = [];
    for (const segment of timeline) {
      if (segment.kind === "reasoning") {
        const isLoading =
          isReasoningStreaming && segment.index === lastPartIndex;
        steps.push(
          renderReasoningStep({
            messageId: message.id,
            index: segment.index,
            text: segment.text,
            isLoading,
            durationSeconds: reasoningDurations[segment.index],
          })
        );
        continue;
      }

      steps.push(
        ...renderCompactedToolRun(
          segment.parts,
          message.id,
          segment.startIndex,
          workspaceId
        )
      );
    }

    renderedParts.push(
      <ChatToolStepGroup
        key={timelineKey || `${message.id}-timeline`}
        isActive={isTimelineActive(
          timeline,
          isReasoningStreaming,
          lastPartIndex,
          isStreaming,
          hasFollowingContent
        )}
        collapsedSummary={buildTimelineCollapsedSummary(timeline)}
      >
        {steps}
      </ChatToolStepGroup>
    );
    timeline = [];
    timelineKey = "";
  };

  message.parts.forEach((part, index) => {
    const key = `${message.id}-${index}`;

    if (isManualApprovalPart(part)) {
      flushTimeline(true);
      const approvalPart = part as unknown as {
        type: string;
        toolCallId: string;
        state: "approval-requested";
        input?: unknown;
        approval: {
          id: string;
          approved?: boolean;
          reason?: string;
          isAutomatic?: boolean;
        };
      };
      renderedParts.push(
        <ToolApprovalCard
          key={key}
          part={approvalPart}
          workspaceId={workspaceId}
          isResponding={!onToolApprovalResponse}
          onApprove={() =>
            onToolApprovalResponse?.(approvalPart.approval.id, true)
          }
          onApproveAlways={
            workspaceId
              ? () =>
                  onToolApprovalResponse?.(approvalPart.approval.id, true, {
                    always: true,
                    toolType: approvalPart.type,
                  })
              : undefined
          }
          onDeny={() =>
            onToolApprovalResponse?.(approvalPart.approval.id, false)
          }
        />
      );
      return;
    }

    if (part.type === "reasoning") {
      flushToolBuffer();
      if (!timelineKey) timelineKey = `timeline-${key}`;
      timeline.push({
        kind: "reasoning",
        index,
        text: part.text ?? "",
      });
      return;
    }

    if (part.type === "tool-spawn_subagent") {
      flushTimeline(true);
      renderedParts.push(
        <ChatSubagentToolPart
          key={key}
          workspaceId={workspaceId}
          part={part as never}
        />
      );
      return;
    }

    if (isStackableToolPart(part)) {
      if (toolBuffer.length === 0) {
        if (!timelineKey) timelineKey = `timeline-${key}`;
        toolBufferStartIndex = index;
      }
      toolBuffer.push(part);
      return;
    }

    // Structural / non-visual parts should not break a connected timeline.
    if (
      part.type === "step-start" ||
      part.type === "source-url" ||
      part.type === "source-document" ||
      part.type === "file"
    ) {
      return;
    }

    flushTimeline(true);

    if (part.type !== "text") return;

    renderedParts.push(
      <Bubble
        key={key}
        align="start"
        variant="ghost"
        className="w-full max-w-full"
      >
        <BubbleContent
          dir="rtl"
          className="w-full max-w-full text-base leading-7"
        >
          <MessageResponse
            isAnimating={isStreaming}
            mode={isStreaming ? "streaming" : "static"}
            animated={isStreaming ? STREAMING_TEXT_ANIMATION : false}
          >
            {part.text}
          </MessageResponse>
        </BubbleContent>
      </Bubble>
    );
  });

  flushTimeline();

  return <>{renderedParts}</>;
}

function getReasoningThinkingMessage(
  isStreaming: boolean,
  duration?: number
): ReactNode {
  if (isStreaming || duration === 0) {
    return <Shimmer duration={1}>در حال فکر کردن…</Shimmer>;
  }

  if (duration === undefined) {
    return <span>چند ثانیه فکر کرد</span>;
  }

  return <span>{duration} ثانیه فکر کرد</span>;
}
