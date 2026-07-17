import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { PassThrough, Writable } from "node:stream";
import test from "node:test";
import {
  CodexAppServerClient,
  CodexRpcError,
  createCodexProcessEnvironment,
  createManagedCodexConfig,
  type CodexProcess,
} from "./app-server-client";

type JsonRpcMessage = {
  id?: number | string;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: { code?: number; message?: string; data?: unknown };
};

function createProcessHarness(
  handleMessage?: (
    message: JsonRpcMessage,
    harness: ReturnType<typeof createProcessHarness>
  ) => void
) {
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  const events = new EventEmitter();
  const received: JsonRpcMessage[] = [];
  let input = "";

  const stdin = new Writable({
    write(chunk, _encoding, callback) {
      input += chunk.toString();
      const lines = input.split("\n");
      input = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) continue;
        const message = JSON.parse(line) as JsonRpcMessage;
        received.push(message);
        handleMessage?.(message, harness);
      }
      callback();
    },
  });

  const child = Object.assign(events, {
    stdin,
    stdout,
    stderr,
    killed: false,
    kill(signal?: NodeJS.Signals) {
      child.killed = true;
      events.emit("exit", 0, signal ?? null);
      return true;
    },
  }) as unknown as CodexProcess;

  const harness = {
    child,
    received,
    send(message: JsonRpcMessage) {
      stdout.write(`${JSON.stringify(message)}\n`);
    },
    sendRaw(line: string) {
      stdout.write(`${line}\n`);
    },
    exit(code = 1, signal: NodeJS.Signals | null = null) {
      events.emit("exit", code, signal);
    },
    fail(error: Error) {
      events.emit("error", error);
    },
    failStdin(error: Error) {
      stdin.emit("error", error);
    },
  };

  return harness;
}

async function withClient(
  createHarness: () => ReturnType<typeof createProcessHarness>,
  operation: (context: {
    client: CodexAppServerClient;
    harness: ReturnType<typeof createProcessHarness>;
    directory: string;
    getSpawnCount: () => number;
  }) => void | Promise<void>
) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "nimruz-codex-rpc-"));
  const harness = createHarness();
  let spawnCount = 0;
  const client = new CodexAppServerClient({
    codexHome: path.join(directory, "home"),
    clientVersion: "9.8.7",
    spawnProcess: () => {
      spawnCount += 1;
      return harness.child;
    },
  });
  try {
    await operation({
      client,
      harness,
      directory,
      getSpawnCount: () => spawnCount,
    });
  } finally {
    client.dispose();
    await rm(directory, { recursive: true, force: true });
  }
}

function replyToInitialize(
  message: JsonRpcMessage,
  harness: ReturnType<typeof createProcessHarness>
) {
  if (message.method === "initialize" && message.id !== undefined) {
    harness.send({ id: message.id, result: { userAgent: "codex-test" } });
  }
}

test("builds an isolated managed-login environment without inherited API credentials", () => {
  const source: NodeJS.ProcessEnv = {
    PATH: "safe-path",
    HTTP_PROXY: "https://proxy.example",
    DATABASE_URL: "postgres://user:password@example/db",
    PGPASSWORD: "database-password",
    NODE_OPTIONS: "--require attacker-controlled-module",
    OPENAI_API_KEY: "secret-openai-key",
    openai_organization: "secret-org",
    CHATGPT_ACCESS_TOKEN: "secret-chatgpt-token",
    Codex_Home: "attacker-controlled-home",
    CODEX_SQLITE_HOME: "attacker-controlled-sqlite",
    CODEX_API_BASE_URL: "https://attacker.example",
    CODEX_CA_CERTIFICATE: "C:\\certs\\corporate.pem",
  };

  const environment = createCodexProcessEnvironment("C:\\Nimruz\\codex", source);

  assert.equal(environment.PATH, "safe-path");
  assert.equal(environment.CODEX_CA_CERTIFICATE, "C:\\certs\\corporate.pem");
  assert.equal(environment.CODEX_HOME, "C:\\Nimruz\\codex");
  assert.equal(environment.CODEX_SQLITE_HOME, "C:\\Nimruz\\codex");
  assert.equal(environment.CODEX_NON_INTERACTIVE, "1");
  assert.equal(environment.NO_COLOR, "1");
  assert.equal(environment.RUST_LOG, "error");
  assert.equal("OPENAI_API_KEY" in environment, false);
  assert.equal("openai_organization" in environment, false);
  assert.equal("CHATGPT_ACCESS_TOKEN" in environment, false);
  assert.equal("Codex_Home" in environment, false);
  assert.equal("CODEX_API_BASE_URL" in environment, false);
  assert.equal("HTTP_PROXY" in environment, false);
  assert.equal("DATABASE_URL" in environment, false);
  assert.equal("PGPASSWORD" in environment, false);
  assert.equal("NODE_OPTIONS" in environment, false);

  // The helper must not mutate Electron's process.env-like source object.
  assert.equal(source.OPENAI_API_KEY, "secret-openai-key");
  assert.equal(source.Codex_Home, "attacker-controlled-home");
});

test("writes a least-privilege managed Codex configuration", async () => {
  const config = createManagedCodexConfig();
  assert.match(config, /default_permissions = "nimruz-chat"/);
  assert.match(config, /":minimal" = "read"/);
  assert.match(config, /filesystem\.\":workspace_roots\"/);
  assert.match(config, /inherit = "none"/);
  assert.match(config, /shell_tool = false/);
  assert.match(config, /remote_plugin = false/);
  assert.match(config, /tool_search = false/);
  assert.match(config, /web_search = "disabled"/);
  assert.doesNotMatch(config, /sandbox_mode/);

  await withClient(
    () =>
      createProcessHarness((message, harness) => {
        replyToInitialize(message, harness);
        if (message.method === "ping" && message.id !== undefined) {
          harness.send({ id: message.id, result: "pong" });
        }
      }),
    async ({ client, directory }) => {
      assert.equal(await client.request("ping"), "pong");
      assert.equal(
        await readFile(path.join(directory, "home", "config.toml"), "utf8"),
        config
      );
    }
  );
});

test("initializes once, frames concurrent JSON-RPC requests, and forwards notifications", async () => {
  await withClient(
    () =>
      createProcessHarness((message, harness) => {
        replyToInitialize(message, harness);
        if (message.method === "account/read" && message.id !== undefined) {
          harness.send({
            method: "account/updated",
            params: { authMode: "chatgpt" },
          });
          harness.send({ id: message.id, result: { account: null } });
        }
        if (message.method === "model/list" && message.id !== undefined) {
          harness.send({ id: message.id, result: { data: [], nextCursor: null } });
        }
      }),
    async ({ client, harness, getSpawnCount }) => {
      const notifications: Array<{ method: string; params: unknown }> = [];
      client.onNotification((method, params) => {
        notifications.push({ method, params });
      });

      const [account, models] = await Promise.all([
        client.request<{ account: null }>("account/read", {
          refreshToken: false,
        }),
        client.request<{ data: unknown[] }>("model/list", { limit: 100 }),
      ]);

      assert.deepEqual(account, { account: null });
      assert.deepEqual(models, { data: [], nextCursor: null });
      assert.equal(getSpawnCount(), 1);
      assert.equal(
        harness.received.filter((message) => message.method === "initialize")
          .length,
        1
      );
      assert.deepEqual(harness.received[0], {
        method: "initialize",
        id: 1,
        params: {
          clientInfo: {
            name: "nimruz_desktop",
            title: "Nimruz Desktop",
            version: "9.8.7",
          },
          capabilities: null,
        },
      });
      assert.deepEqual(harness.received[1], {
        method: "initialized",
      });
      assert.deepEqual(
        harness.received
          .filter((message) => message.id !== undefined && message.id !== 1)
          .map((message) => message.method)
          .sort(),
        ["account/read", "model/list"]
      );
      assert.deepEqual(notifications, [
        {
          method: "account/updated",
          params: { authMode: "chatgpt" },
        },
      ]);
    }
  );
});

test("turns JSON-RPC failures into CodexRpcError with code and data", async () => {
  await withClient(
    () =>
      createProcessHarness((message, harness) => {
        replyToInitialize(message, harness);
        if (message.method === "account/logout" && message.id !== undefined) {
          harness.send({
            id: message.id,
            error: {
              code: -32_001,
              message: "Not logged in",
              data: { authMode: null },
            },
          });
        }
      }),
    async ({ client, harness }) => {
      await assert.rejects(
        () => client.request("account/logout"),
        (error) => {
          assert.ok(error instanceof CodexRpcError);
          assert.equal(error.name, "CodexRpcError");
          assert.equal(error.message, "Not logged in");
          assert.equal(error.code, -32_001);
          assert.deepEqual(error.data, { authMode: null });
          return true;
        }
      );
      assert.deepEqual(
        harness.received.find(
          (message) => message.method === "account/logout"
        ),
        { method: "account/logout", id: 2 }
      );
    }
  );
});

test("rejects unsupported server-initiated requests without treating them as notifications", async () => {
  await withClient(
    () =>
      createProcessHarness((message, harness) => {
        replyToInitialize(message, harness);
        if (message.method === "ping" && message.id !== undefined) {
          harness.send({ id: message.id, result: "pong" });
        }
      }),
    async ({ client, harness }) => {
      const notifications: string[] = [];
      client.onNotification((method) => notifications.push(method));
      assert.equal(await client.request("ping"), "pong");

      harness.send({
        id: "server-request-1",
        method: "item/tool/call",
        params: { dangerous: true },
      });
      harness.sendRaw("this is not json");
      await new Promise((resolve) => setImmediate(resolve));

      assert.deepEqual(
        harness.received.find((message) => message.id === "server-request-1"),
        {
          id: "server-request-1",
          error: {
            code: -32601,
            message:
              "Nimruz does not support server request item/tool/call.",
          },
        }
      );
      assert.deepEqual(notifications, []);
    }
  );
});

test("rejects every pending request and emits one exit event when the process exits", async () => {
  await withClient(
    () =>
      createProcessHarness((message, harness) => {
        replyToInitialize(message, harness);
        if (message.method === "ping" && message.id !== undefined) {
          harness.send({ id: message.id, result: "pong" });
        }
      }),
    async ({ client, harness }) => {
      assert.equal(await client.request("ping"), "pong");
      const exits: Error[] = [];
      client.onExit((error) => exits.push(error));

      const first = client.request("slow/one", {}, 1_000);
      const second = client.request("slow/two", {}, 1_000);
      await new Promise((resolve) => setImmediate(resolve));
      harness.exit(7);

      await assert.rejects(first, /Codex stopped unexpectedly \(7\)/);
      await assert.rejects(second, /Codex stopped unexpectedly \(7\)/);
      assert.equal(exits.length, 1);
      assert.match(exits[0]?.message ?? "", /\(7\)/);
    }
  );
});

test("handles an asynchronous stdin pipe error without crashing the host", async () => {
  await withClient(
    () =>
      createProcessHarness((message, harness) => {
        replyToInitialize(message, harness);
      }),
    async ({ client, harness }) => {
      const exits: Error[] = [];
      client.onExit((error) => exits.push(error));
      const pending = client.request("slow/request", {}, 1_000);
      await new Promise((resolve) => setImmediate(resolve));

      harness.failStdin(new Error("write EPIPE"));

      await assert.rejects(pending, /write EPIPE/);
      assert.equal(exits.length, 1);
      assert.match(exits[0]?.message ?? "", /write EPIPE/);
      assert.equal(harness.child.killed, true);
    }
  );
});

test("reports process startup errors and can retry with a new process", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "nimruz-codex-start-"));
  const healthy = createProcessHarness((message, harness) => {
    replyToInitialize(message, harness);
    if (message.method === "ping" && message.id !== undefined) {
      harness.send({ id: message.id, result: "pong" });
    }
  });
  let attempt = 0;
  const client = new CodexAppServerClient({
    codexHome: path.join(directory, "home"),
    spawnProcess: () => {
      attempt += 1;
      if (attempt === 1) throw new Error("spawn denied");
      return healthy.child;
    },
  });
  try {
    await assert.rejects(() => client.request("ping"), /spawn denied/);
    assert.equal(await client.request("ping"), "pong");
    assert.equal(attempt, 2);
  } finally {
    client.dispose();
    await rm(directory, { recursive: true, force: true });
  }
});

test("ignores delayed exit events from an older process generation", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "nimruz-codex-generation-"));
  const first = createProcessHarness((message, harness) => {
    replyToInitialize(message, harness);
    if (message.method === "ping" && message.id !== undefined) {
      harness.send({ id: message.id, result: "first" });
    }
  });
  const second = createProcessHarness((message, harness) => {
    replyToInitialize(message, harness);
    if (message.method === "ping" && message.id !== undefined) {
      harness.send({ id: message.id, result: "second" });
    }
  });
  const processes = [first, second];
  let spawnCount = 0;
  const client = new CodexAppServerClient({
    codexHome: path.join(directory, "home"),
    spawnProcess: () => processes[spawnCount++]!.child,
  });
  const exits: Error[] = [];
  client.onExit((error) => exits.push(error));

  try {
    assert.equal(await client.request("ping"), "first");
    first.fail(new Error("first process failed"));
    assert.equal(await client.request("ping"), "second");

    const pending = client.request<string>("slow/request", {}, 1_000);
    await new Promise((resolve) => setImmediate(resolve));
    first.exit(1);
    const slowRequest = second.received.find(
      (message) => message.method === "slow/request"
    );
    assert.notEqual(slowRequest?.id, undefined);
    second.send({ id: slowRequest!.id, result: "still alive" });

    assert.equal(await pending, "still alive");
    assert.equal(spawnCount, 2);
    assert.equal(exits.length, 1);
    assert.match(exits[0]?.message ?? "", /first process failed/);
  } finally {
    client.dispose();
    await rm(directory, { recursive: true, force: true });
  }
});

test("times out unanswered requests and dispose terminates the child", async () => {
  await withClient(
    () =>
      createProcessHarness((message, harness) => {
        replyToInitialize(message, harness);
      }),
    async ({ client, harness }) => {
      await assert.rejects(
        () => client.request("never/replies", {}, 25),
        /Codex request timed out: never\/replies/
      );
      assert.equal(harness.child.killed, false);
      client.dispose();
      assert.equal(harness.child.killed, true);
    }
  );
});
