import type { ChatRequestBody, ResolvedChatModel } from "../chat-handler";
import type { CodexTokenUsage, CodexService } from "./service";
import {
  buildChatSystemInstructions,
  buildSystemInstructions,
} from "@/lib/ai/system-prompt";
import { sanitizeAgentMode } from "@/lib/chat/agent-mode";
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
  body: ChatRequestBody & { chatId?: string };
  chatId?: string;
  resolved: ResolvedChatModel;
  codex: CodexService | null;
  signal?: AbortSignal;
  additionalInstructions?: string;
  runId?: string;
  onFinish?: (
    status: "completed" | "failed" | "cancelled",
    error?: string | null
  ) => void;
}) {
  const {
    body,
    resolved,
    codex,
    signal,
    additionalInstructions,
    runId,
    onFinish,
  } = options;
  const chatId = options.chatId ?? body.chatId ?? body.id;
  if (!codex) {
    return new Response(
      JSON.stringify({ error: "Codex is not available in this build." }),
      { status: 503, headers: { "Content-Type": "application/json" } }
    );
  }
  if (typeof chatId !== "string" || !/^[\w-]{1,128}$/.test(chatId)) {
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
  const isChatMode = sanitizeAgentMode(body.agentMode) === "chat";
  const selectedExpert = resolveSelectedExpert(
    sanitizeExperts(body.experts),
    body.selectedExpertSlug
  );
  const instructions = isChatMode
    ? buildChatSystemInstructions(body.personalization)
    : [
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
        additionalInstructions?.trim() ?? "",
        [
          "## Codex mode in Nimruz",
          "Respond as a conversational assistant inside Nimruz.",
          "This managed runtime is intentionally isolated, read-only, non-interactive, and has no workspace, shell, browser, web, plugin, connector, or agent tools.",
          "Do not claim to inspect files, run commands, modify the filesystem, create artifacts, update tasks, or invoke tools.",
        ].join("\n"),
      ]
        .filter(Boolean)
        .join("\n\n");

  const stream = createUIMessageStream({
    originalMessages: body.messages,
    onError: (error) => {
      const message = getChatErrorMessage(error);
      onFinish?.("failed", message);
      return message;
    },
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
          chatId,
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
            messageMetadata: {
              totalUsage: toLanguageModelUsage(lastUsage),
              ...(runId ? { runId } : {}),
            },
          });
        }
        if (result.status === "interrupted") {
          writer.write({ type: "abort", reason: "The response was stopped." });
          onFinish?.("cancelled", "Cancelled by user.");
        } else {
          onFinish?.("completed");
        }
      } finally {
        for (const id of [...openText]) closeText(id);
        for (const id of [...openReasoning]) closeReasoning(id);
      }
    },
  });

  return createUIMessageStreamResponse({ stream });
}
