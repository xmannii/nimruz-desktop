import type { ChatRequestBody, ResolvedChatModel } from "../chat-handler";
import type { CodexTokenUsage, CodexService } from "./service";
import { buildSystemInstructions } from "@/lib/ai/system-prompt";
import { getChatErrorMessage } from "@/lib/chat/errors";
import { sanitizeMemories } from "@/lib/settings/memories";
import {
  resolveSelectedExpert,
  sanitizeExperts,
} from "@/lib/settings/experts";
import { normalizeCodexReasoningEffort } from "@/lib/models/reasoning";
import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  type LanguageModelUsage,
} from "ai";

function toLanguageModelUsage(usage: CodexTokenUsage): LanguageModelUsage {
  const cacheReadTokens = Math.min(usage.inputTokens, usage.cachedInputTokens);
  const reasoningTokens = Math.min(
    usage.outputTokens,
    usage.reasoningOutputTokens
  );
  return {
    inputTokens: usage.inputTokens,
    inputTokenDetails: {
      noCacheTokens: Math.max(0, usage.inputTokens - cacheReadTokens),
      cacheReadTokens,
      cacheWriteTokens: 0,
    },
    outputTokens: usage.outputTokens,
    outputTokenDetails: {
      textTokens: Math.max(0, usage.outputTokens - reasoningTokens),
      reasoningTokens,
    },
    totalTokens: usage.totalTokens,
    raw: {
      modelContextWindow: usage.modelContextWindow,
    },
  };
}

export async function handleCodexChatRequest(options: {
  body: ChatRequestBody;
  resolved: ResolvedChatModel;
  codex: CodexService | null;
  signal?: AbortSignal;
}) {
  const { body, resolved, codex, signal } = options;
  if (!codex) {
    return new Response(
      JSON.stringify({ error: "Codex is not available in this build." }),
      { status: 503, headers: { "Content-Type": "application/json" } }
    );
  }
  if (typeof body.id !== "string" || !/^[\w-]{1,128}$/.test(body.id)) {
    return new Response(JSON.stringify({ error: "Invalid chat id." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const account = await codex.getAccountStatus();
  if (account.state !== "connected") {
    return new Response(
      JSON.stringify({
        error:
          account.message ??
          "Connect your ChatGPT subscription in Settings → Models before using Codex.",
      }),
      { status: 409, headers: { "Content-Type": "application/json" } }
    );
  }

  const selectedReasoningEffort =
    resolved.model.supportsReasoningEffort
      ? normalizeCodexReasoningEffort(body.reasoningEffort)
      : undefined;
  const selectedExpert = resolveSelectedExpert(
    sanitizeExperts(body.experts),
    body.selectedExpertSlug
  );
  const instructions = [
    buildSystemInstructions(
      body.personalization,
      sanitizeMemories(body.memories),
      undefined,
      undefined,
      {
        includeMemoryTools: false,
        includeAgentTools: false,
      }
    ),
    selectedExpert
      ? [
          "## Selected expert mode",
          `Act as the selected expert "${selectedExpert.name}" for this conversation.`,
          selectedExpert.description
            ? `Description: ${selectedExpert.description}`
            : "",
          "Expert instructions:",
          selectedExpert.instructions,
        ]
          .filter(Boolean)
          .join("\n")
      : "",
    [
      "## Codex mode in Nimruz",
      "Respond as a conversational assistant inside Nimruz.",
      "Do not inspect files, run commands, modify the filesystem, or invoke tools unless the user explicitly asks for work that requires them.",
      "The runtime is intentionally read-only and non-interactive.",
    ].join("\n"),
  ]
    .filter(Boolean)
    .join("\n\n");

  const stream = createUIMessageStream({
    originalMessages: body.messages,
    onError: (error) => getChatErrorMessage(error),
    async execute({ writer }) {
      const openText = new Set<string>();
      const openReasoning = new Set<string>();
      let lastUsage: CodexTokenUsage | null = null;

      const closeText = (id: string) => {
        if (!openText.delete(id)) return;
        writer.write({ type: "text-end", id });
      };
      const closeReasoning = (id: string) => {
        if (!openReasoning.delete(id)) return;
        writer.write({ type: "reasoning-end", id });
      };

      try {
        const result = await codex.runTurn({
          chatId: body.id!,
          model: resolved.model.modelId,
          reasoningEffort: selectedReasoningEffort,
          instructions,
          messages: body.messages,
          signal,
          onEvent(event) {
            if (event.type === "text-delta") {
              if (!openText.has(event.itemId)) {
                openText.add(event.itemId);
                writer.write({ type: "text-start", id: event.itemId });
              }
              writer.write({
                type: "text-delta",
                id: event.itemId,
                delta: event.delta,
              });
              return;
            }
            if (event.type === "reasoning-delta") {
              if (!openReasoning.has(event.itemId)) {
                openReasoning.add(event.itemId);
                writer.write({ type: "reasoning-start", id: event.itemId });
              }
              writer.write({
                type: "reasoning-delta",
                id: event.itemId,
                delta: event.delta,
              });
              return;
            }
            if (event.type === "item-completed") {
              closeText(event.itemId);
              closeReasoning(event.itemId);
              return;
            }
            if (event.type === "usage") lastUsage = event.usage;
          },
        });

        for (const id of [...openText]) closeText(id);
        for (const id of [...openReasoning]) closeReasoning(id);
        lastUsage ??= result.usage;
        if (lastUsage) {
          writer.write({
            type: "message-metadata",
            messageMetadata: { totalUsage: toLanguageModelUsage(lastUsage) },
          });
        }
        if (result.status === "interrupted") {
          writer.write({ type: "abort", reason: "The response was stopped." });
        }
      } finally {
        for (const id of [...openText]) closeText(id);
        for (const id of [...openReasoning]) closeReasoning(id);
      }
    },
  });

  return createUIMessageStreamResponse({ stream });
}
