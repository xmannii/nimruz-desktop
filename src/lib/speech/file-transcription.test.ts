import assert from "node:assert/strict";
import test from "node:test";
import {
  formatAudioDuration,
  isSupportedAudioFile,
  splitPcmAtSilence,
  transcriptExportName,
} from "./file-transcription";

test("accepts common audio files and rejects empty or oversized inputs", () => {
  assert.equal(
    isSupportedAudioFile({ name: "voice.mp3", type: "audio/mpeg", size: 12 }),
    true
  );
  assert.equal(
    isSupportedAudioFile({ name: "voice.m4a", type: "", size: 12 }),
    true
  );
  assert.equal(
    isSupportedAudioFile({ name: "notes.txt", type: "text/plain", size: 12 }),
    false
  );
  assert.equal(
    isSupportedAudioFile({ name: "empty.wav", type: "audio/wav", size: 0 }),
    false
  );
});

test("splits PCM into bounded chunks near quiet audio", () => {
  const sampleRate = 100;
  const samples = new Float32Array(1_000).fill(0.8);
  samples.fill(0, 480, 500);
  const chunks = splitPcmAtSilence(samples, sampleRate, 5);

  assert.equal(chunks.length, 2);
  assert.ok(chunks[0].length <= 500);
  assert.equal(chunks[0].length + chunks[1].length, samples.length);
});

test("formats durations and safe transcript export names", () => {
  assert.equal(formatAudioDuration(65), "۱:۰۵");
  assert.equal(formatAudioDuration(3_661), "۱:۰۱:۰۱");
  assert.equal(
    transcriptExportName('meeting:one?.mp3', "corrected"),
    "meeting-one--corrected.txt"
  );
});
