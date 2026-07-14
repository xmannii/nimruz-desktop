"use client";

import {
  Context,
  ContextContent,
  ContextContentBody,
  ContextContentHeader,
  ContextTrigger,
} from "@/components/ai-elements/context";
import type { ChatUIMessage } from "@/lib/chat/message";
import { getModelById, type ModelId } from "@/lib/models";
import {
  aggregateUsageFromMessages,
  estimateUsageCost,
  formatUsageCost,
  formatUsageTokens,
  getCacheReadTokens,
  getContextUsedTokens,
  getReasoningTokens,
} from "@/lib/chat/usage";
import { cn } from "@/lib/utils";
import { memo } from "react";

type ChatContextUsageProps = {
  messages: ChatUIMessage[];
  model: ModelId;
  className?: string;
};

function UsageRow({
  label,
  tokens,
  cost,
}: {
  label: string;
  tokens: number;
  cost?: number;
}) {
  if (tokens <= 0) return null;

  return (
    <div className="flex items-center justify-between gap-3 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span>
        {formatUsageTokens(tokens)}
        {cost != null && cost > 0 ? (
          <span className="ms-2 text-muted-foreground">
            • {formatUsageCost(cost)}
          </span>
        ) : null}
      </span>
    </div>
  );
}

export const ChatContextUsage = memo(function ChatContextUsage({
  messages,
  model,
  className,
}: ChatContextUsageProps) {
  const modelInfo = getModelById(model);
  const usage = aggregateUsageFromMessages(messages);
  const usedTokens = getContextUsedTokens(messages);
  const maxTokens = modelInfo?.contextLength ?? 128_000;

  const costs = usage && modelInfo ? estimateUsageCost(usage, modelInfo) : undefined;
  const cacheTokens = usage ? getCacheReadTokens(usage) : 0;
  const inputTokens = usage
    ? Math.max(0, (usage.inputTokens ?? 0) - cacheTokens)
    : 0;

  return (
    <div className={cn("shrink-0", className)}>
      <Context
        maxTokens={maxTokens}
        usedTokens={usedTokens}
        usage={usage}
      >
        <ContextTrigger
          aria-label="مصرف کانتکست و توکن"
          className="h-auto gap-1.5 px-1 py-0 text-xs font-semibold text-foreground/90 hover:bg-transparent hover:text-foreground"
        />
        <ContextContent align="center" side="top" className="w-72" dir="rtl">
          <ContextContentHeader />
          {usage ? (
            <>
              <ContextContentBody className="space-y-2">
                <UsageRow
                  label="توکن ورودی"
                  tokens={inputTokens}
                  cost={costs?.input}
                />
                <UsageRow
                  label="توکن خروجی"
                  tokens={usage.outputTokens ?? 0}
                  cost={costs?.output}
                />
                <UsageRow
                  label="استدلال"
                  tokens={getReasoningTokens(usage)}
                  cost={costs?.reasoning}
                />
                <UsageRow
                  label="کش"
                  tokens={cacheTokens}
                  cost={costs?.cache}
                />
              </ContextContentBody>
              {costs && costs.total > 0 ? (
                <div className="flex w-full items-center justify-between gap-3 bg-secondary p-3 text-xs">
                  <span className="text-muted-foreground">هزینه کل</span>
                  <span>{formatUsageCost(costs.total)}</span>
                </div>
              ) : null}
            </>
          ) : (
            <ContextContentBody>
              <p className="text-center text-xs text-muted-foreground">
                پس از اتمام پاسخ، جزئیات مصرف نمایش داده می‌شود.
              </p>
            </ContextContentBody>
          )}
        </ContextContent>
      </Context>
    </div>
  );
});
