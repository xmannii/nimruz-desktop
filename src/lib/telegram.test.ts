import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_TELEGRAM_SETTINGS,
  normalizeTelegramBotToken,
  normalizeTelegramProxySettings,
  normalizeTelegramProxyUrl,
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

test("normalizes safe Telegram proxy modes and addresses", () => {
  assert.deepEqual(normalizeTelegramProxySettings({ mode: "system" }), {
    mode: "system",
    url: null,
  });
  assert.deepEqual(
    normalizeTelegramProxySettings({
      mode: "custom",
      url: " socks5://127.0.0.1:1080/ ",
    }),
    { mode: "custom", url: "socks5://127.0.0.1:1080" }
  );
  assert.equal(
    normalizeTelegramProxyUrl("https://proxy.example:8443"),
    "https://proxy.example:8443"
  );
  assert.throws(
    () => normalizeTelegramProxyUrl("socks5://user:secret@127.0.0.1:1080"),
    /نام کاربری و رمز/
  );
  assert.throws(() => normalizeTelegramProxyUrl("ftp://proxy.example"));
});

test("falls back to direct connection for invalid persisted proxy settings", () => {
  assert.deepEqual(
    sanitizeTelegramSettings({
      proxy: { mode: "custom", url: "not a proxy" },
    }).proxy,
    DEFAULT_TELEGRAM_SETTINGS.proxy
  );
});
