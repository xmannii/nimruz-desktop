import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_TELEGRAM_SETTINGS,
  normalizeTelegramBotToken,
  normalizeTelegramUsername,
  sanitizeTelegramSettings,
} from "./telegram";

test("sanitizes Telegram settings without accepting display usernames as identity", () => {
  assert.deepEqual(
    sanitizeTelegramSettings({
      enabled: true,
      workspaceId: "workspace-1",
      pairedUserId: "1234567890123",
      pairedChatId: "1234567890123",
      pairedUsername: "@mani",
      botUsername: "nimruz_bot",
      activeChatId: "telegram-chat",
      lastUpdateId: 42,
    }),
    {
      ...DEFAULT_TELEGRAM_SETTINGS,
      enabled: true,
      workspaceId: "workspace-1",
      pairedUserId: "1234567890123",
      pairedChatId: "1234567890123",
      pairedUsername: "@mani",
      botUsername: "nimruz_bot",
      activeChatId: "telegram-chat",
      lastUpdateId: 42,
    }
  );

  assert.equal(
    sanitizeTelegramSettings({ pairedUserId: "@mani" }).pairedUserId,
    null
  );
});

test("validates bot tokens and normalizes bot usernames", () => {
  const token = "123456789:ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghi";
  assert.equal(normalizeTelegramBotToken(` ${token} `), token);
  assert.throws(() => normalizeTelegramBotToken("not-a-token"));
  assert.equal(normalizeTelegramUsername("@nimruz_bot"), "nimruz_bot");
  assert.equal(normalizeTelegramUsername("bad name"), null);
});

