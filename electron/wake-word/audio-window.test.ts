import assert from "node:assert/strict";
import test from "node:test";
import {
  WAKE_WORD_HOP_SAMPLES,
  WAKE_WORD_WINDOW_SAMPLES,
} from "@/lib/speech/wake-word";
import { RollingAudioWindow, makeEmbeddingWindows } from "./audio-window";

test("keeps a chronological rolling two-second audio window", () => {
  const rolling = new RollingAudioWindow();
  const first = Float32Array.from(
    { length: WAKE_WORD_WINDOW_SAMPLES },
    (_, index) => index
  );
  rolling.append(first);
  assert.equal(rolling.shouldInfer(), true);
  assert.deepEqual(rolling.snapshot(), first);

  const next = Float32Array.from(
    { length: WAKE_WORD_HOP_SAMPLES },
    (_, index) => WAKE_WORD_WINDOW_SAMPLES + index
  );
  rolling.append(next);
  assert.equal(rolling.shouldInfer(), true);
  const snapshot = rolling.snapshot();
  assert.ok(snapshot);
  assert.equal(snapshot[0], WAKE_WORD_HOP_SAMPLES);
  assert.equal(snapshot.at(-1), WAKE_WORD_WINDOW_SAMPLES + next.length - 1);
});

test("builds the final sixteen embedding windows", () => {
  const frames = 204;
  const melBins = 32;
  const mel = Float32Array.from(
    { length: frames * melBins },
    (_, index) => index
  );
  const windows = makeEmbeddingWindows(mel, frames);
  assert.ok(windows);
  assert.equal(windows.length, 16 * 76 * melBins);
  assert.equal(windows[0], 1 * 8 * melBins);
  assert.equal(windows.at(-1), (128 + 75) * melBins + 31);
  assert.equal(makeEmbeddingWindows(mel, 190), null);
});
