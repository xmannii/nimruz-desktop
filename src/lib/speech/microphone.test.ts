import assert from "node:assert/strict";
import test from "node:test";
import {
  createMicrophoneConstraints,
  DEFAULT_MICROPHONE_ID,
} from "./microphone";

test("uses the operating-system microphone when no device is selected", () => {
  const constraints = createMicrophoneConstraints(DEFAULT_MICROPHONE_ID);
  assert.equal(constraints.deviceId, undefined);
  assert.equal(constraints.channelCount, 1);
  assert.equal(constraints.echoCancellation, true);
});

test("requests the selected microphone by exact device id", () => {
  const constraints = createMicrophoneConstraints("external-microphone");
  assert.deepEqual(constraints.deviceId, { exact: "external-microphone" });
});
