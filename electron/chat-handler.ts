import { isReasoningEffort, type ReasoningEffort } from "@/lib/models/reasoning";
import {
  buildChatTools,
  createExpertTools,
  expertToolName,
} from "@/lib/ai/tools";
import { sanitizeMemories } from "@/lib/settings/memories";
import {
  buildChatSystemInstructions,
  buildSystemInstructions,
} from "@/lib/ai/system-prompt";
import {
  sanitizeAgentMode,
  type AgentMode,
} from "@/lib/chat/agent-mode";
import type { SkillCatalogEntry } from "@/lib/skills/catalog";
import type { ChatUIMessage } from "@/lib/chat/message";
import { getChatErrorMessage } from "@/lib/chat/errors";
import { APP_NAME } from "@/lib/branding";
import type { ModelConfig, ProviderConfig } from "@/lib/models/catalog";
import {
  findExplicitExpert,
  resolveSelectedExpert,
  sanitizeExperts,
} from "@/lib/settings/experts";
import { generateChatTitleWithModel } from "@/lib/ai/generate-chat-title-model";
import { fallbackTitleFromMessage } from "@/lib/ai/chat-title";
import type { CodexService } from "./codex/service";
import { handleCodexChatRequest } from "./codex/chat-handler";
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
  id?: string;
  messages: ChatUIMessage[];
  providerId?: string;
  model?: string;
  reasoningEffort?: ReasoningEffort;
  personalization?: unknown;
  memories?: unknown;
  experts?: unknown;
  selectedExpertSlug?: string;
  agentMode?: AgentMode;
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

export type ChatRuntimeOptions = {
  codex?: CodexService | null;
  signal?: AbortSignal;
  skillsRuntime?: SkillsRuntime;
};

function createLanguageModel(resolved: ResolvedChatModel): LanguageModel {
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

export type ChatTitleRequestBody = {
  message: string;
  providerId?: string;
  model?: string;
};

function resolveModelOrError(
  resolveModel: (
    providerId?: string,
    modelId?: string
  ) => ResolvedChatModel | null,
  providerId?: string,
  modelId?: string
): { resolved: ResolvedChatModel } | { error: Response } {
  const resolved = resolveModel(providerId, modelId);
  if (!resolved) {
    return {
      error: new Response(
        JSON.stringify({
          error:
            "هیچ مدل فعالی در دسترس نیست. یک ارائه‌دهنده و مدل را در تنظیمات فعال کنید.",
        }),
        { status: 409, headers: { "Content-Type": "application/json" } }
      ),
    };
  }

  if (
    resolved.provider.kind !== "codex" &&
    resolved.provider.authRequired &&
    !resolved.apiKey
  ) {
    return {
      error: new Response(
        JSON.stringify({
          error:
            resolved.provider.kind === "openrouter"
              ? "کلید OpenRouter تنظیم نشده است. آن را در تنظیمات وارد کنید."
              : `کلید API برای «${resolved.provider.name}» تنظیم نشده است.`,
        }),
        { status: 409, headers: { "Content-Type": "application/json" } }
      ),
    };
  }

  return { resolved };
}

function createLanguageModelOrError(
  resolved: ResolvedChatModel
): { languageModel: LanguageModel } | { error: Response } {
  try {
    return { languageModel: createLanguageModel(resolved) };
  } catch (error) {
    return {
      error: new Response(
        JSON.stringify({
          error: error instanceof Error ? error.message : "پیکربندی مدل نامعتبر است.",
        }),
        { status: 409, headers: { "Content-Type": "application/json" } }
      ),
    };
  }
}

export async function handleGenerateChatTitleRequest(
  body: ChatTitleRequestBody,
  resolveModel: (
    providerId?: string,
    modelId?: string
  ) => ResolvedChatModel | null
): Promise<Response> {
  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!message) {
    return new Response(
      JSON.stringify({ error: "پیام کاربر برای نام‌گذاری لازم است." }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const resolvedResult = resolveModelOrError(
    resolveModel,
    body.providerId,
    body.model
  );
  if ("error" in resolvedResult) return resolvedResult.error;

  try {
    const title = await generateChatTitleWithModel(
      resolvedResult.resolved,
      message
    );

    return new Response(JSON.stringify({ title }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Chat title generation failed:", error);
    const title = fallbackTitleFromMessage(message);
    return new Response(JSON.stringify({ title }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
}

export async function handleChatRequest(
  body: ChatRequestBody,
  resolveModel: (
    providerId?: string,
    modelId?: string
  ) => ResolvedChatModel | null,
  options?: ChatRuntimeOptions
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
  const isChatMode = sanitizeAgentMode(body.agentMode) === "chat";

  const resolvedResult = resolveModelOrError(resolveModel, providerId, model);
  if ("error" in resolvedResult) return resolvedResult.error;
  const resolved = resolvedResult.resolved;

  if (resolved.provider.kind === "codex") {
    return handleCodexChatRequest({
      body,
      resolved,
      codex: options?.codex ?? null,
      signal: options?.signal,
    });
  }

  const modelResult = createLanguageModelOrError(resolved);
  if ("error" in modelResult) return modelResult.error;
  const languageModel = modelResult.languageModel;

  const selectedReasoningEffort =
    resolved.model.supportsReasoningEffort && isReasoningEffort(reasoningEffort)
      ? reasoningEffort
      : undefined;

  const sanitizedExperts = isChatMode ? [] : sanitizeExperts(experts);
  const enabledExperts = sanitizedExperts.filter((expert) => expert.enabled);
  const lastUserText =
    [...messages]
      .reverse()
      .find((message) => message.role === "user")
      ?.parts?.filter(
        (
          part
        ): part is Extract<
          (typeof messages)[number]["parts"][number],
          { type: "text" }
        > => part.type === "text"
      )
      .map((part) => part.text)
      .join("\n") ?? "";
  const explicitExpert =
    resolveSelectedExpert(sanitizedExperts, selectedExpertSlug) ??
    findExplicitExpert(sanitizedExperts, lastUserText);
  const skillsRuntime = isChatMode ? undefined : options?.skillsRuntime;
  const skillsCatalog = skillsRuntime
    ? await skillsRuntime.getSkillsCatalog()
    : [];
  const hasSkills = skillsCatalog.length > 0;
  const chatTools = isChatMode
    ? {}
    : buildChatTools({ skillsRuntime, includeSkills: hasSkills });
  const availableTools: ToolSet | undefined =
    !isChatMode && resolved.model.supportsTools
      ? {
          ...chatTools,
          ...(enabledExperts.length > 0
            ? createExpertTools(sanitizedExperts, languageModel)
            : {}),
        }
      : undefined;
  const routingAppendix = explicitExpert
    ? [
        "## Explicit specialist selection",
        `The user explicitly selected \`${expertToolName(explicitExpert)}\`. Call that tool before answering, using a self-contained brief.`,
      ].join("\n")
    : "";

  const result = streamText({
    model: languageModel,
    abortSignal: options?.signal,
    ...(selectedReasoningEffort ? { reasoning: selectedReasoningEffort } : {}),
    instructions: [
      isChatMode
        ? buildChatSystemInstructions(personalization)
        : buildSystemInstructions(
            personalization,
            sanitizeMemories(memories),
            sanitizedExperts,
            skillsCatalog,
            {
              includeMemoryTools: Boolean(availableTools),
              includeAgentTools: Boolean(availableTools),
            }
          ),
      isChatMode ? "" : routingAppendix,
    ]
      .filter(Boolean)
      .join("\n\n"),
    messages: await convertToModelMessages(messages),
    ...(availableTools
      ? {
          tools: availableTools,
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
