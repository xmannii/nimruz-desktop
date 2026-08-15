import assert from "node:assert/strict";
import test from "node:test";
import {
  advanceSilenceEndpoint,
  createSilenceEndpointState,
  DEFAULT_SILENCE_ENDPOINT,
  pcmRms,
} from "./silence-endpoint";

const config = {
  ...DEFAULT_SILENCE_ENDPOINT,
  startupIgnoreMs: 200,
  minSpeechMs: 200,
  silenceMs: 1_000,
  preSpeechTimeoutMs: 3_000,
};

function tick(
  state: ReturnType<typeof createSilenceEndpointState>,
  rms: number,
  durationMs: number
) {
  return advanceSilenceEndpoint(state, rms, durationMs, config);
}

test("computes RMS energy for PCM frames", () => {
  assert.equal(pcmRms([]), 0);
  assert.equal(pcmRms([0, 0, 0, 0]), 0);
  assert.ok(Math.abs(pcmRms([0.3, -0.3]) - 0.3) < 1e-10);
});

test("ignores startup noise and does not end on the initial pause", () => {
  const state = createSilenceEndpointState();
  assert.equal(tick(state, 0.4, 150), "continue");
  assert.equal(state.heardSpeech, false);
  assert.equal(tick(state, 0, 800), "continue");
  assert.equal(state.heardSpeech, false);
});

test("ends after speech followed by a short silence", () => {
  const state = createSilenceEndpointState();
  assert.equal(tick(state, 0, 250), "continue");
  assert.equal(tick(state, 0.08, 250), "continue");
  assert.equal(state.heardSpeech, true);
  assert.equal(tick(state, 0, 900), "continue");
  assert.equal(tick(state, 0, 200), "end");
});

test("does not treat a brief click as speech", () => {
  const state = createSilenceEndpointState();
  assert.equal(tick(state, 0, 250), "continue");
  assert.equal(tick(state, 0.2, 80), "continue");
  assert.equal(state.heardSpeech, false);
  assert.equal(tick(state, 0, 1_000), "continue");
});

test("times out when the user never starts speaking", () => {
  const state = createSilenceEndpointState();
  assert.equal(tick(state, 0, 250), "continue");
  assert.equal(tick(state, 0.002, 2_500), "continue");
  assert.equal(tick(state, 0.002, 400), "timeout");
});
