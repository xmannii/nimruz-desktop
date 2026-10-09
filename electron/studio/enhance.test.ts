import assert from "node:assert/strict";
import test from "node:test";
import { cleanEnhancedPrompt } from "./enhance";

test("strips labels, fences, and wrapping quotes from enhanced prompts", () => {
  assert.equal(cleanEnhancedPrompt('Prompt: "A quiet alley in Yazd"'), "A quiet alley in Yazd");
  assert.equal(cleanEnhancedPrompt("```\nA cat\n```"), "A cat");
  assert.equal(cleanEnhancedPrompt("«A sign that says \"سلام\"»"), 'A sign that says "سلام"');
});

test("keeps inner quotes that are part of the prompt", () => {
  assert.equal(
    cleanEnhancedPrompt('A poster with the words "نیمروز" in gold'),
    'A poster with the words "نیمروز" in gold'
  );
});
