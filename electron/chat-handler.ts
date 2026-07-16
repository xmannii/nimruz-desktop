import { isReasoningEffort, type ReasoningEffort } from "@/lib/models/reasoning";
import { memoryTools } from "@/lib/ai/memory-tools";
import { skillTools } from "@/lib/ai/skill-tools";
import { sanitizeMemories } from "@/lib/settings/memories";
import { buildSystemInstructions } from "@/lib/ai/system-prompt";
import type { SkillCatalogEntry } from "@/lib/skills/catalog";
import type { ChatUIMessage } from "@/lib/chat/message";
import { getChatErrorMessage } from "@/lib/chat/errors";
import { APP_NAME } from "@/lib/branding";
import type { ModelConfig, ProviderConfig } from "@/lib/models/catalog";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  smoothStream,
  stepCountIs,
  streamText,
  toUIMessageStream,
  type LanguageModel,
} from "ai";

export type ChatRequestBody = {
  messages: ChatUIMessage[];
  providerId?: string;
  model?: string;
  reasoningEffort?: ReasoningEffort;
  personalization?: unknown;
  memories?: unknown;
};

export type ResolvedChatModel = {
  provider: ProviderConfig;
  model: ModelConfig;
  apiKey: string | null;
};

export type SkillsRuntime = {
  getSkillsCatalog: () => Promise<SkillCatalogEntry[]>;
  loadSkillContent: (name: string) => Promise<string | null>;
};

function createLanguageModel(
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

  const compatible = createOpenAICompatible({
    name: provider.id,
    baseURL: provider.baseUrl,
    apiKey: apiKey ?? undefined,
    includeUsage: provider.includeUsage,
  });

  return compatible.chatModel(model.modelId);
}

function createChatTools(skillsRuntime?: SkillsRuntime) {
  return {
    ...memoryTools,
    load_skill: {
      ...skillTools.load_skill,
      execute: async ({ name }: { name: string }) => {
        if (!skillsRuntime) {
          return {
            success: false,
            error: "Skills are not available in this session.",
          };
        }

        const content = await skillsRuntime.loadSkillContent(name);
        if (!content) {
          return {
            success: false,
            error: `Skill "${name}" was not found or is disabled.`,
          };
        }

        return {
          success: true,
          name,
          content,
        };
      },
    },
  };
}

export async function handleChatRequest(
  body: ChatRequestBody,
  resolveModel: (
    providerId?: string,
    modelId?: string
  ) => ResolvedChatModel | null,
  skillsRuntime?: SkillsRuntime
): Promise<Response> {
  const {
    messages,
    providerId,
    model,
    reasoningEffort,
    personalization,
    memories,
  } = body;

  const resolved = resolveModel(providerId, model);
  if (!resolved) {
    return new Response(
      JSON.stringify({
        error:
          "هیچ مدل فعالی در دسترس نیست. یک ارائه‌دهنده و مدل را در تنظیمات فعال کنید.",
      }),
      { status: 409, headers: { "Content-Type": "application/json" } }
    );
  }

  if (resolved.provider.authRequired && !resolved.apiKey) {
    return new Response(
      JSON.stringify({
        error:
          resolved.provider.kind === "openrouter"
            ? "کلید OpenRouter تنظیم نشده است. آن را در تنظیمات وارد کنید."
            : `کلید API برای «${resolved.provider.name}» تنظیم نشده است.`,
      }),
      { status: 409, headers: { "Content-Type": "application/json" } }
    );
  }

  let languageModel: LanguageModel;
  try {
    languageModel = createLanguageModel(resolved);
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "پیکربندی مدل نامعتبر است.",
      }),
      { status: 409, headers: { "Content-Type": "application/json" } }
    );
  }

  const selectedReasoningEffort =
    resolved.model.supportsReasoningEffort && isReasoningEffort(reasoningEffort)
      ? reasoningEffort
      : undefined;

  const skillsCatalog = skillsRuntime
    ? await skillsRuntime.getSkillsCatalog()
    : [];

  const result = streamText({
    model: languageModel,
    ...(selectedReasoningEffort ? { reasoning: selectedReasoningEffort } : {}),
    instructions: buildSystemInstructions(
      personalization,
      sanitizeMemories(memories),
      skillsCatalog
    ),
    messages: await convertToModelMessages(messages),
    ...(resolved.model.supportsTools
      ? {
          tools: createChatTools(skillsRuntime),
          stopWhen: stepCountIs(8),
        }
      : {}),
    experimental_transform: smoothStream({
      delayInMs: 12,
      chunking:
        typeof Intl !== "undefined" && "Segmenter" in Intl
          ? new Intl.Segmenter("fa", { granularity: "word" })
          : "word",
    }),
  });

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({
      stream: result.stream,
      originalMessages: messages,
      sendReasoning: true,
      onError: (error) => getChatErrorMessage(error),
      messageMetadata: ({ part }) => {
        if (part.type === "finish") {
          return { totalUsage: part.totalUsage };
        }
      },
    }),
  });
}
