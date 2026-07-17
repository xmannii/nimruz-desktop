import assert from "node:assert/strict";
import test from "node:test";
import type { UIMessage } from "ai";
import type { ResolvedChatModel } from "../chat-handler";
import {
  createSpawnSubagentTool,
  getFinalSubagentText,
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

test("reserves a tool-free final step for the subagent summary", () => {
  assert.equal(prepareSubagentStep({ stepNumber: 11 }), undefined);
  assert.deepEqual(prepareSubagentStep({ stepNumber: 12 }), {
    activeTools: [],
  });
});
