import assert from "node:assert/strict";
import test from "node:test";
import { buildGeminiTtsPrompt, isGeminiTtsModel } from "./tts-prompt";

test("leaves the script untouched when there is no direction", () => {
  assert.equal(buildGeminiTtsPrompt("سلام دنیا", undefined), "سلام دنیا");
  assert.equal(buildGeminiTtsPrompt("سلام دنیا", "   "), "سلام دنیا");
});

test("separates direction from the words to speak", () => {
  const prompt = buildGeminiTtsPrompt("سلام دنیا", "گرم و آرام");
  const [direction, transcript] = prompt.split("#### TRANSCRIPT\n");
  assert.match(direction, /Do NOT speak them/);
  assert.match(direction, /### PERFORMANCE\nگرم و آرام/);
  assert.equal(transcript, "سلام دنیا");
});

test("recognises Gemini TTS ids on Google and OpenRouter", () => {
  assert.equal(isGeminiTtsModel("gemini-3.1-flash-tts-preview"), true);
  assert.equal(isGeminiTtsModel("google/gemini-3.8-flash-tts"), true);
  assert.equal(isGeminiTtsModel("openai/gpt-4o-mini-tts"), false);
  assert.equal(isGeminiTtsModel("google/gemini-3-flash"), false);
});
