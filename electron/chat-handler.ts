import { ALLOWED_MODEL_IDS, DEFAULT_MODEL } from "@/lib/models";
import { isReasoningEffort, type ReasoningEffort } from "@/lib/models/reasoning";
import { memoryTools } from "@/lib/ai/memory-tools";
import { sanitizeMemories } from "@/lib/settings/memories";
import { buildSystemInstructions } from "@/lib/ai/system-prompt";
import type { ChatUIMessage } from "@/lib/chat/message";
import { APP_NAME } from "@/lib/branding";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  smoothStream,
  stepCountIs,
  streamText,
  toUIMessageStream,
} from "ai";

export type ChatRequestBody = {
  messages: ChatUIMessage[];
  model?: string;
  reasoningEffort?: ReasoningEffort;
  personalization?: unknown;
  memories?: unknown;
};

export async function handleChatRequest(
  body: ChatRequestBody,
  apiKey: string | null
): Promise<Response> {
  const { messages, model, reasoningEffort, personalization, memories } = body;

  if (!apiKey) {
    return new Response(
      JSON.stringify({
        error: "کلید OpenRouter تنظیم نشده است. آن را در تنظیمات وارد کنید.",
      }),
      { status: 409, headers: { "Content-Type": "application/json" } }
    );
  }

  const openrouter = createOpenRouter({
    apiKey,
    appName: APP_NAME,
  });

  const selectedModel =
    model && ALLOWED_MODEL_IDS.has(model) ? model : DEFAULT_MODEL;
  const selectedReasoningEffort = isReasoningEffort(reasoningEffort)
    ? reasoningEffort
    : undefined;

  const result = streamText({
    model: openrouter.chat(selectedModel, {
      usage: { include: true },
    }),
    ...(selectedReasoningEffort ? { reasoning: selectedReasoningEffort } : {}),
    instructions: buildSystemInstructions(
      personalization,
      sanitizeMemories(memories)
    ),
    messages: await convertToModelMessages(messages),
    tools: memoryTools,
    stopWhen: stepCountIs(5),
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
      messageMetadata: ({ part }) => {
        if (part.type === "finish") {
          return { totalUsage: part.totalUsage };
        }
      },
    }),
  });
}
