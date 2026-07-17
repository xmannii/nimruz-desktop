import assert from "node:assert/strict";
import test from "node:test";
import { shouldPreferResearchSubagent } from "./research-intent";

test("prefers research delegation for whole-site architecture analysis", () => {
  assert.equal(
    shouldPreferResearchSubagent(
      "نحوه کار سایت رو بررسی کن بعدش یه دیاگرام بساز از سایت"
    ),
    true
  );
  assert.equal(
    shouldPreferResearchSubagent(
      "Explore the repository architecture and explain how the website works"
    ),
    true
  );
});

test("keeps focused file work with the main agent", () => {
  assert.equal(
    shouldPreferResearchSubagent("این فایل page.tsx رو بررسی کن"),
    false
  );
  assert.equal(
    shouldPreferResearchSubagent("Fix the website header spacing"),
    false
  );
});

test("respects an explicit request not to delegate", () => {
  assert.equal(
    shouldPreferResearchSubagent(
      "بدون استفاده از دستیار پژوهشی معماری سایت را بررسی کن"
    ),
    false
  );
});
