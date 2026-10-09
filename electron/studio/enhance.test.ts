import assert from "node:assert/strict";
import test from "node:test";
import { cleanEnhancedPrompt, cleanTaggedScript } from "./enhance";

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

test("accepts tagged scripts only when the spoken words are unchanged", () => {
  const original = "سلام! باورم نمی‌شه که اومدی.\nخیلی خوشحالم.";
  const tagged = "[excited] سلام! [laughs] باورم نمی‌شه که اومدی…\n[softly] خیلی خوشحالم.";
  assert.equal(cleanTaggedScript(tagged, original), tagged);
  assert.equal(
    cleanTaggedScript("[excited] Hello! I can't believe you came.", original),
    ""
  );
  // Dropped half-spaces are tolerated; changed words are not.
  assert.notEqual(cleanTaggedScript("[happy] سلام! باورم نمیشه که اومدی.\nخیلی خوشحالم.", original), "");
  assert.equal(cleanTaggedScript("[happy] سلام! باورم نمی‌شه که رسیدی.\nخیلی خوشحالم.", original), "");
});
