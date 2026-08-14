import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_WAKE_WORD_SETTINGS,
  WAKE_WORD_DEFAULT_THRESHOLD,
  WAKE_WORD_MAX_THRESHOLD,
  WAKE_WORD_MIN_THRESHOLD,
  isWakeWordAudioPayload,
  sanitizeWakeWordSettings,
} from "./wake-word";

test("sanitizes persisted wake-word settings", () => {
  assert.deepEqual(sanitizeWakeWordSettings(null), DEFAULT_WAKE_WORD_SETTINGS);
  assert.deepEqual(sanitizeWakeWordSettings({ enabled: true, threshold: 0.8 }), {
    enabled: true,
    threshold: 0.8,
  });
  assert.equal(
    sanitizeWakeWordSettings({ threshold: 100 }).threshold,
    WAKE_WORD_MAX_THRESHOLD
  );
  assert.equal(
    sanitizeWakeWordSettings({ threshold: -1 }).threshold,
    WAKE_WORD_MIN_THRESHOLD
  );
  assert.equal(
    sanitizeWakeWordSettings({ threshold: Number.NaN }).threshold,
    WAKE_WORD_DEFAULT_THRESHOLD
  );
});

test("accepts bounded float PCM payloads", () => {
  assert.equal(isWakeWordAudioPayload(new Float32Array(1_280).buffer), true);
  assert.equal(isWakeWordAudioPayload(new ArrayBuffer(0)), false);
  assert.equal(isWakeWordAudioPayload(new ArrayBuffer(3)), false);
  assert.equal(
    isWakeWordAudioPayload(new Float32Array(16_001).buffer),
    false
  );
});
