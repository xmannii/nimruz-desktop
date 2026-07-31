import assert from "node:assert/strict";
import test from "node:test";
import {
  buildTelegramHelpMessage,
  buildTelegramPairedWelcomeMessage,
  buildTelegramUnpairedStartMessage,
} from "./telegram-messages";

test("paired welcome is Telegram HTML with keyboard button labels", () => {
  const text = buildTelegramPairedWelcomeMessage({
    botUsername: "nimruz_bot",
    workspaceTitle: "خانه",
  });
  assert.match(text, /<b>نیمروز به این حساب متصل شد<\/b>/);
  assert.match(text, /@nimruz_bot/);
  assert.match(text, /خانه/);
  assert.match(text, /گفت‌وگوی تازه/);
  assert.match(text, /\/help/);
  assert.ok(text.includes("@nimruz_bot"));
});

test("unpaired start guides users back to desktop settings", () => {
  const text = buildTelegramUnpairedStartMessage({ botUsername: "nimruz_bot" });
  assert.match(text, /جفت/);
  assert.match(text, /تنظیمات/);
  assert.match(text, /@nimruz_bot/);
});

test("help mentions media modes and differs when unpaired", () => {
  const paired = buildTelegramHelpMessage({
    botUsername: "x",
    workspaceTitle: "پروژه",
    paired: true,
  });
  assert.match(paired, /PDF/);
  assert.match(paired, /آرتیفکت/);
  assert.doesNotMatch(paired, /هنوز به این نیمروز جفت نشده‌اید/);

  const unpaired = buildTelegramHelpMessage({ paired: false });
  assert.match(unpaired, /هنوز به این نیمروز جفت نشده‌اید/);
});
