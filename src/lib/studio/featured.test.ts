import assert from "node:assert/strict";
import test from "node:test";
import { featuredRank, isNewModel, supportsAudioTags } from "./featured";

test("ranks the newest flagships first", () => {
  assert.equal(featuredRank("image", "google/gemini-nano-banana-2.1"), 0);
  assert.equal(featuredRank("image", "openai/gpt-image-2.5-flare"), 1);
  assert.equal(featuredRank("video", "bytedance/seedance-2.5"), 0);
  assert.equal(featuredRank("speech", "elevenlabs/eleven-v4"), 0);
  assert.equal(featuredRank("speech", "google/gemini-3.8-flash-tts"), 1);
  assert.equal(featuredRank("speech", "hexgrad/kokoro-82m"), null);
});

test("matches direct Google model ids too", () => {
  assert.notEqual(featuredRank("video", "veo-3.1-fast-generate-preview"), null);
  assert.notEqual(featuredRank("image", "imagen-4.0-ultra-generate-001"), null);
});

test("flags models released in the last two months as new", () => {
  const now = Date.UTC(2026, 9, 9);
  assert.equal(isNewModel(now - 10 * 86_400_000, now), true);
  assert.equal(isNewModel(now - 90 * 86_400_000, now), false);
  assert.equal(isNewModel(null, now), false);
});

test("detects ElevenLabs models that understand audio tags", () => {
  assert.equal(supportsAudioTags("elevenlabs/eleven-v3"), true);
  assert.equal(supportsAudioTags("elevenlabs/eleven-v4-turbo"), true);
  assert.equal(supportsAudioTags("eleven_v3"), true);
  assert.equal(supportsAudioTags("elevenlabs/eleven-multilingual-v2"), false);
  assert.equal(supportsAudioTags("google/gemini-3.8-flash-tts"), false);
});
