import type { ChatUIMessage } from "@/lib/chat/message";
import type { ModelInfo } from "@/lib/models";
import type { LanguageModelUsage } from "ai";

export function getReasoningTokens(usage: LanguageModelUsage): number {
  return usage.outputTokenDetails?.reasoningTokens ?? 0;
}

export function getCacheReadTokens(usage: LanguageModelUsage): number {
  return usage.inputTokenDetails?.cacheReadTokens ?? 0;
}

const faCompact = new Intl.NumberFormat("fa-IR", { notation: "compact" });
const faPercent = new Intl.NumberFormat("fa-IR", {
  maximumFractionDigits: 1,
  style: "percent",
});
const faCurrency = new Intl.NumberFormat("fa-IR", {
  currency: "USD",
  style: "currency",
});

export function formatUsageTokens(count: number): string {
  return faCompact.format(count);
}

export function formatUsagePercent(used: number, max: number): string {
  if (max <= 0) return faPercent.format(0);
  return faPercent.format(used / max);
}

export function formatUsageCost(amount: number): string {
  return faCurrency.format(amount);
}

function addUsage(
  left: LanguageModelUsage,
  right: LanguageModelUsage
): LanguageModelUsage {
  return {
    inputTokens: (left.inputTokens ?? 0) + (right.inputTokens ?? 0),
    outputTokens: (left.outputTokens ?? 0) + (right.outputTokens ?? 0),
    totalTokens: (left.totalTokens ?? 0) + (right.totalTokens ?? 0),
    inputTokenDetails: {
      noCacheTokens:
        (left.inputTokenDetails?.noCacheTokens ?? 0) +
        (right.inputTokenDetails?.noCacheTokens ?? 0),
      cacheReadTokens:
        (left.inputTokenDetails?.cacheReadTokens ?? 0) +
        (right.inputTokenDetails?.cacheReadTokens ?? 0),
      cacheWriteTokens:
        (left.inputTokenDetails?.cacheWriteTokens ?? 0) +
        (right.inputTokenDetails?.cacheWriteTokens ?? 0),
    },
    outputTokenDetails: {
      textTokens:
        (left.outputTokenDetails?.textTokens ?? 0) +
        (right.outputTokenDetails?.textTokens ?? 0),
      reasoningTokens:
        (left.outputTokenDetails?.reasoningTokens ?? 0) +
        (right.outputTokenDetails?.reasoningTokens ?? 0),
    },
  };
}

export function aggregateUsageFromMessages(
  messages: ChatUIMessage[]
): LanguageModelUsage | undefined {
  let aggregated: LanguageModelUsage | undefined;

  for (const message of messages) {
    const usage = message.metadata?.totalUsage;
    if (message.role !== "assistant" || !usage) continue;
    aggregated = aggregated ? addUsage(aggregated, usage) : usage;
  }

  return aggregated;
}

export function getContextUsedTokens(messages: ChatUIMessage[]): number {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role !== "assistant") continue;

    const usage = message.metadata?.totalUsage;
    if (usage?.inputTokens != null) return usage.inputTokens;
    if (usage?.totalTokens != null) return usage.totalTokens;
  }

  return aggregateUsageFromMessages(messages)?.totalTokens ?? 0;
}

export function estimateUsageCost(
  usage: LanguageModelUsage,
  model: ModelInfo
): {
  input: number;
  output: number;
  reasoning: number;
  cache: number;
  total: number;
} {
  const inputTokens = usage.inputTokens ?? 0;
  const outputTokens = usage.outputTokens ?? 0;
  const reasoningTokens = getReasoningTokens(usage);
  const cacheTokens = getCacheReadTokens(usage);
  const nonCachedInput = Math.max(0, inputTokens - cacheTokens);

  const input = (nonCachedInput * model.inputPricePerM) / 1_000_000;
  const cache = (cacheTokens * model.inputPricePerM * 0.1) / 1_000_000;
  const output = (outputTokens * model.outputPricePerM) / 1_000_000;
  const reasoning = (reasoningTokens * model.outputPricePerM) / 1_000_000;

  return {
    input,
    output,
    reasoning,
    cache,
    total: input + output + reasoning + cache,
  };
}
