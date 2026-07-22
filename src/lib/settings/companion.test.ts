import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_COMPANION_SHORTCUT_SETTINGS,
  formatCompanionAccelerator,
  isValidCompanionAccelerator,
  keyboardEventToCompanionAccelerator,
  sanitizeCompanionShortcutSettings,
} from "./companion";

test("sanitizes persisted companion shortcut settings", () => {
  assert.deepEqual(sanitizeCompanionShortcutSettings(null), DEFAULT_COMPANION_SHORTCUT_SETTINGS);
  assert.deepEqual(
    sanitizeCompanionShortcutSettings({
      enabled: false,
      accelerator: "Command+Shift+K",
    }),
    {
      enabled: false,
      accelerator: "Command+Shift+K",
      microphoneEnabled: true,
      microphoneAccelerator: "CommandOrControl+Shift+M",
    }
  );
  assert.deepEqual(
    sanitizeCompanionShortcutSettings({
      enabled: false,
      accelerator: "Command+Shift+K",
      microphoneEnabled: false,
      microphoneAccelerator: "Command+Shift+R",
    }),
    {
      enabled: false,
      accelerator: "Command+Shift+K",
      microphoneEnabled: false,
      microphoneAccelerator: "Command+Shift+R",
    }
  );
  assert.equal(isValidCompanionAccelerator("Shift+K"), false);
  assert.equal(isValidCompanionAccelerator("Command+Shift+K"), true);
  assert.equal(isValidCompanionAccelerator("Command+Unknown"), false);
});

test("records supported shortcut key combinations", () => {
  assert.equal(
    keyboardEventToCompanionAccelerator(
      { key: "k", metaKey: true, ctrlKey: false, altKey: false, shiftKey: true },
      "darwin"
    ),
    "Command+Shift+K"
  );
  assert.equal(
    keyboardEventToCompanionAccelerator(
      { key: " ", metaKey: false, ctrlKey: true, altKey: false, shiftKey: true },
      "win32"
    ),
    "Control+Shift+Space"
  );
  assert.equal(
    keyboardEventToCompanionAccelerator(
      { key: "k", metaKey: false, ctrlKey: false, altKey: false, shiftKey: true },
      "darwin"
    ),
    null
  );
});

test("formats shortcuts for macOS and Windows", () => {
  assert.equal(formatCompanionAccelerator("CommandOrControl+Shift+Space", "darwin"), "⌘⇧Space");
  assert.equal(formatCompanionAccelerator("CommandOrControl+Shift+Space", "win32"), "Ctrl+Shift+Space");
});
