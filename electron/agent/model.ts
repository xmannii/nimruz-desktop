import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import type { LanguageModel } from "ai";
import { APP_NAME } from "@/lib/branding";
import type { ResolvedChatModel } from "../chat-handler";

export function createLanguageModel(
  resolved: ResolvedChatModel
): LanguageModel {
  const { provider, model, apiKey } = resolved;

  if (provider.kind === "openrouter") {
    if (!apiKey) {
      throw new Error("کلید OpenRouter تنظیم نشده است.");
    }
    const openrouter = createOpenRouter({
      apiKey,
      appName: APP_NAME,
    });
    return openrouter.chat(model.modelId, {
      usage: { include: true },
    });
  }

  if (!apiKey && provider.authRequired) {
    throw new Error(`کلید API برای «${provider.name}» تنظیم نشده است.`);
  }
  if (provider.kind === "openai") {
    return createOpenAI({
      apiKey: apiKey ?? undefined,
      baseURL: provider.baseUrl,
    }).chat(model.modelId);
  }
  if (provider.kind === "anthropic") {
    return createAnthropic({
      apiKey: apiKey ?? undefined,
      baseURL: provider.baseUrl,
    }).messages(model.modelId);
  }
  if (provider.kind === "google") {
    return createGoogleGenerativeAI({
      apiKey: apiKey ?? undefined,
      baseURL: provider.baseUrl,
    }).chat(model.modelId);
  }

  const compatible = createOpenAICompatible({
    name: provider.id,
    baseURL: provider.baseUrl,
    apiKey: apiKey ?? undefined,
    includeUsage: provider.includeUsage,
  });

  return compatible.chatModel(model.modelId);
}
