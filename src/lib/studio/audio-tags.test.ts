import assert from "node:assert/strict";
import test from "node:test";
import { splitAudioTags, textDirection, translateAudioTag } from "./audio-tags";

test("translates common tags to Persian with a colour group", () => {
  assert.deepEqual(translateAudioTag("whispers"), { label: "نجوا", tone: "delivery" });
  assert.deepEqual(translateAudioTag(" Laughs "), { label: "خنده", tone: "sound" });
  assert.deepEqual(translateAudioTag("short pause"), { label: "مکث کوتاه", tone: "pause" });
  assert.deepEqual(translateAudioTag("excited"), { label: "هیجان‌زده", tone: "emotion" });
});

test("keeps unknown tags readable instead of dropping them", () => {
  assert.deepEqual(translateAudioTag("robot voice"), { label: "robot voice", tone: "delivery" });
  assert.equal(translateAudioTag("dramatic pause").tone, "pause");
});

test("splits a script into text and tag segments in order", () => {
  const segments = splitAudioTags("[excited] سلام! [laughs] خوبی؟");
  assert.deepEqual(
    segments.map((segment) => (segment.type === "tag" ? `<${segment.label}>` : segment.value)),
    ["<هیجان‌زده>", " سلام! ", "<خنده>", " خوبی؟"]
  );
  assert.deepEqual(splitAudioTags("بدون برچسب"), [{ type: "text", value: "بدون برچسب" }]);
});

test("detects direction while ignoring leading tags", () => {
  assert.equal(textDirection("[excited] سلام دنیا"), "rtl");
  assert.equal(textDirection("[whispers] hello there"), "ltr");
  assert.equal(textDirection("۱۲۳ [pause] ..."), "rtl");
});
