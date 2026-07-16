import { isReasoningEffort, type ReasoningEffort } from "@/lib/models/reasoning";
import {
  buildChatTools,
  createExpertTools,
  expertToolName,
} from "@/lib/ai/tools";
import { sanitizeMemories } from "@/lib/settings/memories";
import { buildSystemInstructions } from "@/lib/ai/system-prompt";
import type { SkillCatalogEntry } from "@/lib/skills/catalog";
import type { ChatUIMessage } from "@/lib/chat/message";
import { getChatErrorMessage } from "@/lib/chat/errors";
import { APP_NAME } from "@/lib/branding";
import type { ModelConfig, ProviderConfig } from "@/lib/models/catalog";
import { findExplicitExpert, resolveSelectedExpert, sanitizeExperts } from "@/lib/settings/experts";
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
  type ToolSet,
} from "ai";

export type ChatRequestBody = {
  messages: ChatUIMessage[];
  providerId?: string;
  model?: string;
  reasoningEffort?: ReasoningEffort;
  personalization?: unknown;
  memories?: unknown;
  experts?: unknown;
  selectedExpertSlug?: string;
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
    experts,
    selectedExpertSlug,
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

  const sanitizedExperts = sanitizeExperts(experts);
  const enabledExperts = sanitizedExperts.filter((expert) => expert.enabled);
  const lastUserText = [...messages].reverse().find((message) => message.role === "user")?.parts
    ?.filter((part): part is Extract<(typeof messages)[number]["parts"][number], { type: "text" }> => part.type === "text")
    .map((part) => part.text).join("\n") ?? "";
  const explicitExpert =
    resolveSelectedExpert(sanitizedExperts, selectedExpertSlug) ??
    findExplicitExpert(sanitizedExperts, lastUserText);
  const skillsCatalog = skillsRuntime
    ? await skillsRuntime.getSkillsCatalog()
    : [];
  const hasSkills = skillsCatalog.length > 0;
  const chatTools = buildChatTools({ skillsRuntime, includeSkills: hasSkills });
  const availableTools: ToolSet | undefined = resolved.model.supportsTools
    ? {
        ...chatTools,
        ...(enabledExperts.length > 0
          ? createExpertTools(sanitizedExperts, languageModel)
          : {}),
      }
    : undefined;

  const result = streamText({
    model: languageModel,
    ...(selectedReasoningEffort ? { reasoning: selectedReasoningEffort } : {}),
    instructions: buildSystemInstructions(
      personalization,
      sanitizeMemories(memories),
      sanitizedExperts,
      skillsCatalog,
    ),
    messages: await convertToModelMessages(messages),
    ...(availableTools
      ? {
          tools: availableTools,
          stopWhen: stepCountIs(8),
          ...(explicitExpert
            ? {
                prepareStep: ({ stepNumber }: { stepNumber: number }) => ({
                  toolChoice:
                    stepNumber === 0
                      ? { type: "tool" as const, toolName: expertToolName(explicitExpert) }
                      : "auto" as const,
                }),
              }
            : {}),
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
