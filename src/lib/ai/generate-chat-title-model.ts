import {
  fallbackTitleFromMessage,
  isValidChatTitle,
  normalizeChatTitle,
} from "@/lib/ai/chat-title";
import { fetchOpenAICompatibleChatCompletion } from "@/lib/ai/openai-compatible-chat";
import type { ModelConfig, ProviderConfig } from "@/lib/models/catalog";

export type TitleGenerationModel = {
  provider: ProviderConfig;
  model: ModelConfig;
  apiKey: string | null;
};

const TITLE_INSTRUCTIONS = [
  "Reply with only a short chat title summarizing the user message.",
  "Use the user's language (Persian when they write in Persian).",
  "Keep it under 80 characters.",
  "No quotes, labels, punctuation-only output, or explanation.",
].join(" ");

function cleanRawTitle(text: string) {
  const firstLine = text.trim().split("\n")[0] ?? "";
  const withoutLabel = firstLine.replace(
    /^(title|chat title|عنوان|نام گفتگو)\s*[:：\-]\s*/i,
    ""
  );
  return normalizeChatTitle(
    withoutLabel.replace(/^["'`«»]+|["'`«»]+$/g, "")
  );
}

/** Title generation via minimal OpenAI-compatible chat completions. */
export async function generateChatTitleWithModel(
  resolved: TitleGenerationModel,
  message: string
): Promise<string> {
  const trimmed = message.trim().replace(/\s+/g, " ");
  if (!trimmed) return fallbackTitleFromMessage(message);

  try {
    const text = await fetchOpenAICompatibleChatCompletion({
      provider: resolved.provider,
      apiKey: resolved.apiKey,
      modelId: resolved.model.modelId,
      messages: [
        { role: "system", content: TITLE_INSTRUCTIONS },
        { role: "user", content: trimmed },
      ],
      timeoutMs: 15_000,
    });

    const title = cleanRawTitle(text);
    if (isValidChatTitle(title)) return title;
  } catch {
    // Fall back to a local title when the provider rejects the request.
  }

  return fallbackTitleFromMessage(trimmed);
}
