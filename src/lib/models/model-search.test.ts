import assert from "node:assert/strict";
import test from "node:test";
import { filterModelGroups } from "./model-search";

const groups = [
  {
    provider: { name: "OpenRouter" },
    models: [
      {
        name: "Claude Haiku 4.5",
        fullName: "Anthropic: Claude Haiku 4.5",
        modelId: "anthropic/claude-haiku-4.5",
      },
      {
        name: "GPT-5",
        fullName: "OpenAI: GPT-5",
        modelId: "openai/gpt-5",
      },
    ],
  },
  {
    provider: { name: "Codex" },
    models: [{ name: "GPT-5 Codex", fullName: "GPT-5 Codex", modelId: "gpt-5-codex" }],
  },
];

test("returns every group for an empty query", () => {
  assert.equal(filterModelGroups(groups, "   "), groups);
});

test("matches name, id, and provider case-insensitively", () => {
  assert.deepEqual(
    filterModelGroups(groups, "HAIKU").map((group) =>
      group.models.map((model) => model.modelId)
    ),
    [["anthropic/claude-haiku-4.5"]]
  );
  assert.deepEqual(
    filterModelGroups(groups, "gpt-5").map((group) => group.provider.name),
    ["OpenRouter", "Codex"]
  );
  assert.deepEqual(
    filterModelGroups(groups, "codex").map((group) => group.models.length),
    [1]
  );
});

test("requires every term to match and drops empty groups", () => {
  assert.deepEqual(
    filterModelGroups(groups, "openrouter gpt").map((group) =>
      group.models.map((model) => model.modelId)
    ),
    [["openai/gpt-5"]]
  );
  assert.deepEqual(filterModelGroups(groups, "gemini"), []);
});
