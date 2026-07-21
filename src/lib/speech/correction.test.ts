import assert from "node:assert/strict";
import test from "node:test";
import {
  cleanCorrectedTranscript,
  splitTextForCorrection,
} from "./correction";

test("splits long correction text into bounded ordered chunks", () => {
  const text = `${"الف ".repeat(80)}\n\n${"ب ".repeat(80)}`;
  const chunks = splitTextForCorrection(text, 120);

  assert.ok(chunks.length > 1);
  assert.ok(chunks.every((chunk) => chunk.length <= 120));
  assert.ok(chunks[0].startsWith("الف"));
  assert.ok(chunks.at(-1)?.endsWith("ب"));
});

test("removes a full Markdown fence from corrected output", () => {
  assert.equal(
    cleanCorrectedTranscript("```text\nمتن اصلاح‌شده\n```"),
    "متن اصلاح‌شده"
  );
  assert.equal(cleanCorrectedTranscript("متن ساده"), "متن ساده");
});
