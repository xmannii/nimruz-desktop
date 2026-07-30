import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import type { AgentRuntimeDeps } from "../agent/runtime";
import type { CredentialService } from "../credentials";
import type { ShenavaService } from "../shenava/service";
import { AppDatabase } from "../storage/database";
import { TelegramService } from "./service";

const TOKEN = "123456789:ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghi";
const USER_ID = 123456789;

async function waitFor(check: () => boolean) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (check()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error("Timed out waiting for Telegram service state.");
}

function createCredentials() {
  let storedToken: string | null = null;
  const credentials = {
    getStatus: () => ({
      configured: Boolean(storedToken),
      hint: storedToken ? "••••fghi" : null,
      encryptionAvailable: true,
      backend: "test",
      secure: true,
    }),
    getKey: () => storedToken,
    setKey: (_id: string, token: unknown) => {
      storedToken = String(token);
      return {
        configured: true,
        hint: "••••fghi",
        encryptionAvailable: true,
        backend: "test",
        secure: true,
      };
    },
    clearKey: () => {
      storedToken = null;
    },
  } as unknown as CredentialService;
  return credentials;
}

test("pairs through a one-time deep link and stores the immutable Telegram id", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "nimruz-telegram-"));
  const database = new AppDatabase(path.join(directory, "test.sqlite3"));
  let resolveUpdates: ((response: Response) => void) | null = null;
  const credentials = createCredentials();

  const fetchImpl: typeof fetch = async (input, init) => {
    const url = String(input);
    if (url.endsWith("/getMe")) {
      return Response.json({
        ok: true,
        result: {
          id: 99,
          is_bot: true,
          first_name: "Nimruz",
          username: "nimruz_bot",
        },
      });
    }
    if (url.endsWith("/deleteWebhook")) {
      return Response.json({ ok: true, result: true });
    }
    if (url.endsWith("/getUpdates")) {
      return new Promise<Response>((resolve, reject) => {
        resolveUpdates = resolve;
        init?.signal?.addEventListener(
          "abort",
          () => reject(new DOMException("Aborted", "AbortError")),
          { once: true }
        );
      });
    }
    if (url.endsWith("/sendMessage")) {
      return Response.json({
        ok: true,
        result: {
          message_id: 1,
          chat: { id: USER_ID, type: "private" },
        },
      });
    }
    throw new Error(`Unexpected Telegram request: ${url}`);
  };

  const service = new TelegramService({
    database,
    credentials,
    fetchImpl,
    agentDeps: {} as AgentRuntimeDeps,
    runAgent: async () => new Response(),
    shenava: {} as ShenavaService,
  });

  try {
    const status = await service.configure(TOKEN, "home");
    assert.ok(status.pairingCode);
    assert.equal(
      status.pairingLink,
      `https://t.me/nimruz_bot?start=${status.pairingCode}`
    );
    await waitFor(() => Boolean(resolveUpdates));
    resolveUpdates!(
      Response.json({
        ok: true,
        result: [
          {
            update_id: 17,
            message: {
              message_id: 3,
              from: {
                id: USER_ID,
                is_bot: false,
                first_name: "Mani",
                username: "mani",
              },
              chat: { id: USER_ID, type: "private" },
              text: `/start ${status.pairingCode}`,
            },
          },
        ],
      })
    );

    await waitFor(
      () => database.loadTelegramSettings().pairedUserId === String(USER_ID)
    );
    assert.equal(database.loadTelegramSettings().pairedUsername, "@mani");
    assert.equal(database.loadTelegramSettings().lastUpdateId, 17);
    assert.equal(service.getStatus().pairingCode, null);
  } finally {
    service.dispose();
    database.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("rejects Telegram voice notes when Shenava is not installed", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "nimruz-telegram-"));
  const database = new AppDatabase(path.join(directory, "test.sqlite3"));
  const credentials = createCredentials();
  const sent: string[] = [];
  let resolveUpdates: ((response: Response) => void) | null = null;
  let updateGeneration = 0;

  const fetchImpl: typeof fetch = async (input, init) => {
    const url = String(input);
    if (url.endsWith("/getMe")) {
      return Response.json({
        ok: true,
        result: {
          id: 99,
          is_bot: true,
          first_name: "Nimruz",
          username: "nimruz_bot",
        },
      });
    }
    if (url.endsWith("/deleteWebhook")) {
      return Response.json({ ok: true, result: true });
    }
    if (url.endsWith("/getUpdates")) {
      return new Promise<Response>((resolve, reject) => {
        resolveUpdates = resolve;
        init?.signal?.addEventListener(
          "abort",
          () => reject(new DOMException("Aborted", "AbortError")),
          { once: true }
        );
      });
    }
    if (url.endsWith("/sendMessage")) {
      const body =
        typeof init?.body === "string"
          ? (JSON.parse(init.body) as { text?: string })
          : {};
      if (typeof body.text === "string") sent.push(body.text);
      return Response.json({
        ok: true,
        result: {
          message_id: sent.length,
          chat: { id: USER_ID, type: "private" },
        },
      });
    }
    throw new Error(`Unexpected Telegram request: ${url}`);
  };

  const shenava = {
    getStatus: async () => ({
      activeModelKey: "rizeh",
      models: {
        rizeh: { installed: false },
        koochik: { installed: false },
      },
    }),
  } as unknown as ShenavaService;

  const service = new TelegramService({
    database,
    credentials,
    fetchImpl,
    agentDeps: {} as AgentRuntimeDeps,
    runAgent: async () => {
      throw new Error("Agent should not run for untranscribed voice.");
    },
    shenava,
  });

  async function pushUpdate(update: unknown) {
    await waitFor(() => Boolean(resolveUpdates));
    const resolve = resolveUpdates!;
    resolveUpdates = null;
    updateGeneration += 1;
    resolve(
      Response.json({
        ok: true,
        result: [{ update_id: updateGeneration, ...(update as object) }],
      })
    );
  }

  try {
    const status = await service.configure(TOKEN, "home");
    await pushUpdate({
      message: {
        message_id: 3,
        from: {
          id: USER_ID,
          is_bot: false,
          first_name: "Mani",
          username: "mani",
        },
        chat: { id: USER_ID, type: "private" },
        text: `/start ${status.pairingCode}`,
      },
    });
    await waitFor(
      () => database.loadTelegramSettings().pairedUserId === String(USER_ID)
    );

    await pushUpdate({
      message: {
        message_id: 4,
        from: {
          id: USER_ID,
          is_bot: false,
          first_name: "Mani",
          username: "mani",
        },
        chat: { id: USER_ID, type: "private" },
        voice: {
          file_id: "voice-1",
          file_unique_id: "unique-1",
          duration: 4,
          mime_type: "audio/ogg",
          file_size: 1200,
        },
      },
    });

    await waitFor(() =>
      sent.some(
        (text) => text.includes("مدل‌های شنوا") && text.includes("گفتار")
      )
    );
    assert.ok(
      sent.some(
        (text) => text.includes("مدل‌های شنوا") && text.includes("گفتار")
      )
    );
    assert.equal(service.getStatus().busy, false);
  } finally {
    service.dispose();
    database.close();
    await rm(directory, { recursive: true, force: true });
  }
});
