import assert from "node:assert/strict";
import test from "node:test";
import type { UIMessage } from "ai";
import type { ResolvedChatModel } from "../chat-handler";
import {
  createSpawnSubagentTool,
  getFinalSubagentText,
  hasIncompleteSubagentToolCalls,
  prepareSubagentStep,
} from "./subagent";

test("omits spawn tool when no configured model resolves", () => {
  const result = createSpawnSubagentTool({
    models: [
      {
        id: "researcher",
        providerId: "missing",
        modelId: "missing",
        description: "",
        enabled: true,
      },
    ],
    resolveModel: () => null,
    tools: { fetch_url: {} as never },
  });

  assert.equal(result, null);
});

test("omits spawn tool when policy allows no nested capabilities", () => {
  const result = createSpawnSubagentTool({
    models: [],
    resolveModel: () => null,
    tools: {},
  });

  assert.equal(result, null);
});

test("registers spawn tool for an enabled tool-capable model", () => {
  const resolved = {
    provider: {
      id: "local",
      kind: "openai-compatible",
      authRequired: false,
    },
    model: {
      modelId: "researcher",
      fullName: "Researcher",
      enabled: true,
      supportsTools: true,
    },
    apiKey: null,
  } as ResolvedChatModel;

  const result = createSpawnSubagentTool({
    models: [
      {
        id: "researcher",
        providerId: "local",
        modelId: "researcher",
        description: "Large codebases",
        enabled: true,
      },
    ],
    resolveModel: () => resolved,
    tools: { fetch_url: {} as never },
  });

  assert.ok(result);
});

test("extracts only final text for the parent model", () => {
  const transcript = {
    id: "subagent-message",
    role: "assistant",
    parts: [
      { type: "step-start" },
      { type: "text", text: "## Findings\nVerified result." },
    ],
  } as UIMessage;

  assert.equal(
    getFinalSubagentText(transcript),
    "## Findings\nVerified result."
  );
});

test("uses a bounded fallback when a transcript has no final text", () => {
  const transcript = {
    id: "subagent-message",
    role: "assistant",
    parts: [{ type: "step-start" }],
  } as UIMessage;

  assert.equal(
    getFinalSubagentText(transcript),
    "The research subagent completed without a summary."
  );
});

test("detects a transcript that ended during a nested tool call", () => {
  const transcript = {
    id: "subagent-message",
    role: "assistant",
    parts: [
      {
        type: "tool-read_file",
        toolCallId: "read-1",
        state: "input-available",
        input: { path: "src/app.tsx" },
      },
    ],
  } as unknown as UIMessage;

  assert.equal(hasIncompleteSubagentToolCalls(transcript), true);

  const completed = {
    ...transcript,
    parts: [
      {
        ...transcript.parts[0],
        state: "output-available",
        output: "file contents",
      },
    ],
  } as unknown as UIMessage;
  assert.equal(hasIncompleteSubagentToolCalls(completed), false);
});

test("preserves useful text and labels a partial subagent result", () => {
  const transcript = {
    id: "subagent-message",
    role: "assistant",
    metadata: {
      subagent: {
        status: "partial",
        attempt: 2,
        maxAttempts: 2,
        error: "The stream ended during a tool call.",
      },
    },
    parts: [
      { type: "text", text: "First verified finding." },
      { type: "step-start" },
      { type: "text", text: "Second verified finding." },
    ],
  } as UIMessage;

  const result = getFinalSubagentText(transcript);
  assert.match(result, /First verified finding/);
  assert.match(result, /Second verified finding/);
  assert.match(result, /partial result/);
  assert.match(result, /stream ended during a tool call/);
});

test("reserves a tool-free final step for the subagent summary", () => {
  assert.equal(prepareSubagentStep({ stepNumber: 11 }), undefined);
  assert.deepEqual(prepareSubagentStep({ stepNumber: 12 }), {
    activeTools: [],
  });
});
