"use client";

import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "@/components/ai-elements/reasoning";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { MessageResponse } from "@/components/ai-elements/message";
import { ChatMemoryToolPart } from "@/components/chat/chat-memory-tool-part";
import { ChatExpertToolPart } from "@/components/chat/chat-expert-tool-part";
import { ChatSkillToolPart } from "@/components/chat/chat-skill-tool-part";
import { ChatFetchUrlToolPart } from "@/components/chat/chat-web-tool-part";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
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
import { cn } from "@/lib/utils";
import type { ChatStatus, UIMessage } from "ai";
import { getChatErrorMessage } from "@/lib/chat/errors";
import { memo, useEffect, useRef, type ReactNode } from "react";

type ChatMessagesProps = {
  messages: UIMessage[];
  status: ChatStatus;
  error?: Error;
};

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

export function ChatMessages({ messages, status, error }: ChatMessagesProps) {
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
}: {
  message: UIMessage;
  isStreaming: boolean;
}) {
  const isUser = message.role === "user";

  return (
    <MessageScrollerItem messageId={message.id}>
      <Message
        align={isUser ? "end" : "start"}
        className={cn("text-base", !isUser && "max-w-full")}
        dir="ltr"
      >
        <MessageContent className={cn(!isUser && "w-full max-w-full")}>
          {isUser ? (
            <UserMessageParts message={message} />
          ) : (
            <AssistantMessageParts
              message={message}
              isStreaming={isStreaming}
            />
          )}
        </MessageContent>
      </Message>
    </MessageScrollerItem>
  );
});

function UserMessageParts({ message }: { message: UIMessage }) {
  return message.parts.map((part, index) => {
    if (part.type !== "text") return null;

    return (
      <Bubble
        key={`${message.id}-${index}`}
        align="end"
        variant="default"
      >
        <BubbleContent dir="rtl" className="text-base leading-7">
          <span className="whitespace-pre-wrap">{part.text}</span>
        </BubbleContent>
      </Bubble>
    );
  });
}

const STREAMING_TEXT_ANIMATION = {
  animation: "fadeIn",
  duration: 0.28,
  sep: "word" as const,
  stagger: 0.03,
};

function AssistantMessageParts({
  message,
  isStreaming,
}: {
  message: UIMessage;
  isStreaming: boolean;
}) {
  const reasoningParts = message.parts.filter((part) => part.type === "reasoning");
  const reasoningText = reasoningParts
    .map((part) => part.text)
    .filter(Boolean)
    .join("\n\n");
  const hasReasoning = reasoningParts.length > 0;
  const hasReasoningText = reasoningText.trim().length > 0;
  const lastPart = message.parts.at(-1);
  const isReasoningStreaming =
    isStreaming && lastPart?.type === "reasoning";

  return (
    <>
      {hasReasoning ? (
        <Reasoning
          className="mb-2 w-full"
          defaultOpen={false}
          isStreaming={isReasoningStreaming}
        >
          <ReasoningTrigger
            dir="rtl"
            getThinkingMessage={getReasoningThinkingMessage}
            showChevron={hasReasoningText && !isReasoningStreaming}
          />
          {hasReasoningText && !isReasoningStreaming ? (
            <ReasoningContent dir="ltr" mode="static">
              {reasoningText}
            </ReasoningContent>
          ) : null}
        </Reasoning>
      ) : null}

      {message.parts.map((part, index) => {
        if (
          part.type === "tool-create_expert" ||
          part.type.startsWith("tool-expert_")
        ) {
          return (
            <ChatExpertToolPart
              key={`${message.id}-${index}`}
              part={part as { type: string; state: string; input?: { name?: string; slug?: string }; output?: { success?: boolean; slug?: string } }}
            />
          );
        }

        if (
          part.type === "tool-save_memory" ||
          part.type === "tool-delete_memory"
        ) {
          return (
            <ChatMemoryToolPart
              key={`${message.id}-${index}`}
              part={
                part as Extract<
                  (typeof message.parts)[number],
                  { type: "tool-save_memory" | "tool-delete_memory" }
                >
              }
            />
          );
        }

        if (part.type === "tool-load_skill") {
          return (
            <ChatSkillToolPart
              key={`${message.id}-${index}`}
              part={
                part as Extract<
                  (typeof message.parts)[number],
                  { type: "tool-load_skill" }
                >
              }
            />
          );
        }

        if (part.type === "tool-fetch_url") {
          return (
            <ChatFetchUrlToolPart
              key={`${message.id}-${index}`}
              part={
                part as Extract<
                  (typeof message.parts)[number],
                  { type: "tool-fetch_url" }
                >
              }
            />
          );
        }

        if (part.type === "reasoning") return null;

        if (part.type !== "text") return null;

        return (
          <Bubble
            key={`${message.id}-${index}`}
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
      })}
    </>
  );
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
