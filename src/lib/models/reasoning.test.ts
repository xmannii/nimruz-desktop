import assert from "node:assert/strict";
import test from "node:test";
import {
  CODEX_REASONING_EFFORT_LEVELS,
  normalizeCodexReasoningEffort,
} from "./reasoning";

test("Codex exposes only supported Nimruz reasoning levels", () => {
  assert.deepEqual(CODEX_REASONING_EFFORT_LEVELS, [
    "low",
    "medium",
    "high",
    "xhigh",
  ]);
  assert.equal(normalizeCodexReasoningEffort("none"), "low");
  assert.equal(normalizeCodexReasoningEffort("minimal"), "low");
  assert.equal(normalizeCodexReasoningEffort("high"), "high");
  assert.equal(normalizeCodexReasoningEffort("invalid"), undefined);
});
