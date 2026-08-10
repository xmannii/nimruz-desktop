import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_APPEARANCE_SETTINGS,
  DEFAULT_FONT_FAMILY,
  SYSTEM_FONT_VALUE,
  sanitizeAppearanceSettings,
} from "./appearance";

test("uses Vazirmatn as the default appearance font", () => {
  assert.equal(DEFAULT_FONT_FAMILY, "Vazirmatn");
  assert.equal(DEFAULT_APPEARANCE_SETTINGS.fontFamily, "Vazirmatn");
  assert.equal(sanitizeAppearanceSettings(null).fontFamily, "Vazirmatn");
});

test("preserves an explicit system-font selection", () => {
  assert.equal(
    sanitizeAppearanceSettings({ fontFamily: "system" }).fontFamily,
    SYSTEM_FONT_VALUE
  );
});
