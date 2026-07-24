import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  sanitizeNotificationSettings,
} from "./notifications";

test("notification settings default to useful native alerts with sound opt-in", () => {
  assert.deepEqual(
    sanitizeNotificationSettings(null),
    DEFAULT_NOTIFICATION_SETTINGS
  );
  assert.equal(DEFAULT_NOTIFICATION_SETTINGS.desktopNotificationsEnabled, true);
  assert.equal(DEFAULT_NOTIFICATION_SETTINGS.completionSound, false);
});

test("notification settings preserve valid category choices and reject invalid values", () => {
  assert.deepEqual(
    sanitizeNotificationSettings({
      desktopNotificationsEnabled: false,
      agentCompleted: false,
      agentFailed: true,
      approvalRequired: false,
      modelDownloads: false,
      completionSound: true,
    }),
    {
      desktopNotificationsEnabled: false,
      agentCompleted: false,
      agentFailed: true,
      approvalRequired: false,
      modelDownloads: false,
      completionSound: true,
    }
  );

  assert.equal(
    sanitizeNotificationSettings({ completionSound: "yes" }).completionSound,
    false
  );
});
