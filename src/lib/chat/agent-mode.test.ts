import assert from "node:assert/strict";
import test from "node:test";
import {
  AGENT_MODES,
  isAgentMode,
  nextAgentMode,
  sanitizeAgentMode,
} from "./agent-mode";

test("supports and cycles through the tool-free chat mode", () => {
  assert.deepEqual(AGENT_MODES, ["general", "plan", "chat"]);
  assert.equal(isAgentMode("chat"), true);
  assert.equal(sanitizeAgentMode("chat"), "chat");
  assert.equal(nextAgentMode("plan"), "chat");
  assert.equal(nextAgentMode("chat"), "general");
});
