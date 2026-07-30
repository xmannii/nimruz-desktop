import assert from "node:assert/strict";
import test from "node:test";
import { TelegramApi } from "./api";

test("uses Telegram Bot API methods for identity, polling, and file download", async () => {
  const calls: Array<{ url: string; body?: Record<string, unknown> }> = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = String(input);
    const body =
      typeof init?.body === "string"
        ? (JSON.parse(init.body) as Record<string, unknown>)
        : undefined;
    calls.push({ url, body });

    if (url.endsWith("/getMe")) {
      return Response.json({
        ok: true,
        result: {
          id: 1,
          is_bot: true,
          first_name: "Nimruz",
          username: "nimruz_bot",
        },
      });
    }
    if (url.endsWith("/getUpdates")) {
      return Response.json({ ok: true, result: [] });
    }
    if (url.endsWith("/getFile")) {
      return Response.json({
        ok: true,
        result: {
          file_id: "voice-1",
          file_unique_id: "unique-1",
          file_path: "voice/file.oga",
        },
      });
    }
    if (url.includes("/file/bot")) {
      return new Response(new Uint8Array([1, 2, 3]));
    }
    return Response.json({ ok: true, result: true });
  };

  const api = new TelegramApi(
    "123456789:ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghi",
    fetchImpl
  );
  assert.equal((await api.getMe()).username, "nimruz_bot");
  await api.getUpdates({ offset: 11, timeout: 25 });
  assert.deepEqual(await api.downloadFile("voice-1"), new Uint8Array([1, 2, 3]));

  assert.equal(calls[1]?.body?.offset, 11);
  assert.deepEqual(calls[1]?.body?.allowed_updates, [
    "message",
    "callback_query",
  ]);
  assert.ok(calls[3]?.url.endsWith("/voice/file.oga"));
});

test("sends HTML parse mode and reply keyboards", async () => {
  const calls: Array<{ url: string; body?: Record<string, unknown> }> = [];
  const api = new TelegramApi(
    "123456789:ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghi",
    async (input, init) => {
      const url = String(input);
      const body =
        typeof init?.body === "string"
          ? (JSON.parse(init.body) as Record<string, unknown>)
          : undefined;
      calls.push({ url, body });
      return Response.json({
        ok: true,
        result: {
          message_id: 9,
          chat: { id: 1, type: "private" },
        },
      });
    }
  );

  await api.sendMessage("1", "<b>hi</b>", {
    parseMode: "HTML",
    replyMarkup: {
      keyboard: [[{ text: "راهنما" }]],
      resize_keyboard: true,
    },
  });

  assert.equal(calls[0]?.body?.parse_mode, "HTML");
  assert.deepEqual(calls[0]?.body?.reply_markup, {
    keyboard: [[{ text: "راهنما" }]],
    resize_keyboard: true,
  });
});

test("surfaces Telegram API descriptions", async () => {
  const api = new TelegramApi(
    "123456789:ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghi",
    async () =>
      Response.json(
        { ok: false, description: "Unauthorized" },
        { status: 401 }
      )
  );
  await assert.rejects(() => api.getMe(), /Unauthorized/);
});

