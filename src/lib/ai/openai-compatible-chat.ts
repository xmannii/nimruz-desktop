import { APP_NAME } from "@/lib/branding";
import {
  OPENROUTER_PROVIDER_ID,
  type ProviderConfig,
} from "@/lib/models/catalog";

export type ChatCompletionMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export function chatCompletionsUrl(baseUrl: string) {
  return `${baseUrl.replace(/\/$/, "")}/chat/completions`;
}

function buildCompletionHeaders(
  provider: ProviderConfig,
  apiKey: string | null
) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  if (
    provider.kind === "openrouter" ||
    provider.id === OPENROUTER_PROVIDER_ID
  ) {
    headers["HTTP-Referer"] = "https://github.com/xmannii/nimruz-desktop";
    headers["X-Title"] = APP_NAME;
  }

  return headers;
}

export function extractCompletionText(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;

  const choices = (payload as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) return null;

  const message = (choices[0] as { message?: { content?: unknown } }).message;
  const content = message?.content;

  if (typeof content === "string" && content.trim()) {
    return content;
  }

  if (Array.isArray(content)) {
    const text = content
      .map((part) => {
        if (!part || typeof part !== "object") return "";
        if ("text" in part && typeof part.text === "string") return part.text;
        return "";
      })
      .join("");
    return text.trim() || null;
  }

  return null;
}

export function readCompletionErrorMessage(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;

  const error = (payload as { error?: unknown }).error;
  if (typeof error === "string" && error.trim()) return error.trim();
  if (error && typeof error === "object") {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message.trim();
  }

  const message = (payload as { message?: unknown }).message;
  if (typeof message === "string" && message.trim()) return message.trim();

  return null;
}

/** Minimal OpenAI-compatible chat completion — no provider-specific token params. */
export async function fetchOpenAICompatibleChatCompletion(options: {
  provider: ProviderConfig;
  apiKey: string | null;
  modelId: string;
  messages: ChatCompletionMessage[];
  timeoutMs?: number;
}): Promise<string> {
  const { provider, apiKey, modelId, messages, timeoutMs = 20_000 } = options;

  if (provider.kind === "anthropic") {
    if (!apiKey) throw new Error("Anthropic API key is required.");
    const system = messages
      .filter((message) => message.role === "system")
      .map((message) => message.content)
      .join("\n");
    const response = await fetch(
      `${provider.baseUrl.replace(/\/$/, "")}/messages`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: modelId,
          max_tokens: 128,
          ...(system ? { system } : {}),
          messages: messages
            .filter((message) => message.role !== "system")
            .map((message) => ({
              role: message.role,
              content: message.content,
            })),
        }),
        signal: AbortSignal.timeout(timeoutMs),
      }
    );
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(
        readCompletionErrorMessage(payload) ??
          `Anthropic completion failed (HTTP ${response.status}).`
      );
    }
    const blocks =
      payload && typeof payload === "object"
        ? (payload as { content?: unknown }).content
        : null;
    const text = Array.isArray(blocks)
      ? blocks
          .map((block) =>
            block &&
            typeof block === "object" &&
            "text" in block &&
            typeof block.text === "string"
              ? block.text
              : ""
          )
          .join("")
      : "";
    if (!text.trim()) throw new Error("Empty Anthropic completion response.");
    return text;
  }

  if (provider.kind === "google") {
    if (!apiKey) throw new Error("Google API key is required.");
    const system = messages
      .filter((message) => message.role === "system")
      .map((message) => message.content)
      .join("\n");
    const response = await fetch(
      `${provider.baseUrl.replace(/\/$/, "")}/models/${encodeURIComponent(modelId)}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          ...(system
            ? { systemInstruction: { parts: [{ text: system }] } }
            : {}),
          contents: messages
            .filter((message) => message.role !== "system")
            .map((message) => ({
              role: message.role === "assistant" ? "model" : "user",
              parts: [{ text: message.content }],
            })),
          generationConfig: { maxOutputTokens: 128 },
        }),
        signal: AbortSignal.timeout(timeoutMs),
      }
    );
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(
        readCompletionErrorMessage(payload) ??
          `Google completion failed (HTTP ${response.status}).`
      );
    }
    const candidates =
      payload && typeof payload === "object"
        ? (payload as { candidates?: unknown }).candidates
        : null;
    const first = Array.isArray(candidates) ? candidates[0] : null;
    const parts =
      first && typeof first === "object"
        ? (first as { content?: { parts?: unknown } }).content?.parts
        : null;
    const text = Array.isArray(parts)
      ? parts
          .map((part) =>
            part &&
            typeof part === "object" &&
            "text" in part &&
            typeof part.text === "string"
              ? part.text
              : ""
          )
          .join("")
      : "";
    if (!text.trim()) throw new Error("Empty Google completion response.");
    return text;
  }

  const response = await fetch(chatCompletionsUrl(provider.baseUrl), {
    method: "POST",
    headers: buildCompletionHeaders(provider, apiKey),
    body: JSON.stringify({
      model: modelId,
      messages,
      stream: false,
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(
      readCompletionErrorMessage(payload) ??
        `Chat completion failed (HTTP ${response.status}).`
    );
  }

  const text = extractCompletionText(payload);
  if (!text) {
    throw new Error("Empty completion response from model.");
  }

  return text;
}
