import assert from "node:assert/strict";
import test from "node:test";
import {
  SUBAGENT_MODEL_LIMITS,
  sanitizeSubagentModel,
  sanitizeSubagentModels,
} from "./subagents";

test("sanitizes a configured subagent model", () => {
  assert.deepEqual(
    sanitizeSubagentModel({
      id: "researcher",
      providerId: " openrouter ",
      modelId: " anthropic/claude ",
      description: " Deep repository research ",
      enabled: false,
    }),
    {
      id: "researcher",
      providerId: "openrouter",
      modelId: "anthropic/claude",
      description: "Deep repository research",
      enabled: false,
    }
  );
});

test("drops invalid and duplicate model references", () => {
  const models = sanitizeSubagentModels([
    { id: "one", providerId: "p", modelId: "m", enabled: true },
    { id: "two", providerId: "p", modelId: "m", enabled: true },
    { id: "missing-model", providerId: "p" },
  ]);

  assert.equal(models.length, 1);
  assert.equal(models[0]?.id, "one");
});

test("caps configured subagent models", () => {
  const models = sanitizeSubagentModels(
    Array.from(
      { length: SUBAGENT_MODEL_LIMITS.maxEntries + 4 },
      (_, index) => ({
        id: `model-${index}`,
        providerId: "provider",
        modelId: `model-${index}`,
      })
    )
  );

  assert.equal(models.length, SUBAGENT_MODEL_LIMITS.maxEntries);
});
