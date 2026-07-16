import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { EventEmitter } from "node:events";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import readline from "node:readline";
import type { Readable, Writable } from "node:stream";
import { resolveCodexExecutable } from "./runtime";

type RpcId = number | string;

type RpcError = {
  code?: number;
  message?: string;
  data?: unknown;
};

type RpcMessage = {
  id?: RpcId;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: RpcError;
};

type PendingRequest = {
  method: string;
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

export type CodexProcess = {
  stdin: Writable;
  stdout: Readable;
  stderr: Readable;
  killed: boolean;
  kill: (signal?: NodeJS.Signals) => boolean;
  once: ChildProcessWithoutNullStreams["once"];
  on: ChildProcessWithoutNullStreams["on"];
};

export class CodexRpcError extends Error {
  readonly code: number | undefined;
  readonly data: unknown;

  constructor(method: string, error: RpcError) {
    super(error.message || `Codex request failed: ${method}`);
    this.name = "CodexRpcError";
    this.code = error.code;
    this.data = error.data;
  }
}

export const NIMRUZ_CODEX_PERMISSION_PROFILE = "nimruz-chat";

export function createManagedCodexConfig() {
  return `# Managed by Nimruz. This Codex home is isolated from the Codex CLI.
approval_policy = "never"
default_permissions = "${NIMRUZ_CODEX_PERMISSION_PROFILE}"
web_search = "disabled"
check_for_update_on_startup = false
include_apps_instructions = false
include_collaboration_mode_instructions = false

[permissions.${NIMRUZ_CODEX_PERMISSION_PROFILE}]
description = "Read-only access to Nimruz's dedicated empty workspace."

[permissions.${NIMRUZ_CODEX_PERMISSION_PROFILE}.filesystem]
":minimal" = "read"

[permissions.${NIMRUZ_CODEX_PERMISSION_PROFILE}.filesystem.":workspace_roots"]
"." = "read"

[permissions.${NIMRUZ_CODEX_PERMISSION_PROFILE}.network]
enabled = false

[shell_environment_policy]
inherit = "none"
ignore_default_excludes = false
experimental_use_profile = false

[features]
apply_patch_freeform = false
apps = false
auth_elicitation = false
browser_use = false
code_mode = false
computer_use = false
connectors = false
image_generation = false
in_app_browser = false
js_repl = false
memories = false
memory_tool = false
multi_agent = false
multi_agent_v2 = false
plugins = false
remote_plugin = false
request_permissions = false
request_permissions_tool = false
search_tool = false
shell_tool = false
tool_search = false
tool_suggest = false
unified_exec = false
web_search = false
web_search_request = false
`;
}

function writeManagedCodexConfig(codexHome: string) {
  writeFileSync(path.join(codexHome, "config.toml"), createManagedCodexConfig(), {
    encoding: "utf8",
    mode: 0o600,
  });
}

export function createCodexProcessEnvironment(
  codexHome: string,
  source: NodeJS.ProcessEnv = process.env
): NodeJS.ProcessEnv {
  const allowed = new Set([
    "APPDATA",
    "CODEX_CA_CERTIFICATE",
    "COLORTERM",
    "COMSPEC",
    "DBUS_SESSION_BUS_ADDRESS",
    "DISPLAY",
    "HOME",
    "LANG",
    "LANGUAGE",
    "LOCALAPPDATA",
    "LOGNAME",
    "PATH",
    "PATHEXT",
    "PROGRAMDATA",
    "SHELL",
    "SSL_CERT_DIR",
    "SSL_CERT_FILE",
    "SYSTEMROOT",
    "TEMP",
    "TERM",
    "TMP",
    "TMPDIR",
    "USER",
    "USERNAME",
    "USERPROFILE",
    "WAYLAND_DISPLAY",
    "WINDIR",
    "XDG_RUNTIME_DIR",
  ]);
  const environment: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(source)) {
    const normalized = key.toUpperCase();
    if (allowed.has(normalized) || normalized.startsWith("LC_")) {
      environment[key] = value;
    }
  }

  return {
    ...environment,
    CODEX_HOME: codexHome,
    CODEX_SQLITE_HOME: codexHome,
    CODEX_NON_INTERACTIVE: "1",
    NO_COLOR: "1",
    RUST_LOG: "error",
  };
}

export class CodexAppServerClient {
  private readonly events = new EventEmitter();
  private readonly pending = new Map<RpcId, PendingRequest>();
  private readonly codexHome: string;
  private readonly spawnProcess: () => CodexProcess;
  private readonly clientVersion: string;
  private process: CodexProcess | null = null;
  private starting: Promise<void> | null = null;
  private nextRequestId = 1;
  private stopping = false;

  constructor(options: {
    codexHome: string;
    executablePath?: string;
    clientVersion?: string;
    spawnProcess?: () => CodexProcess;
  }) {
    this.codexHome = options.codexHome;
    this.clientVersion = options.clientVersion ?? "0.1.0";
    this.spawnProcess =
      options.spawnProcess ??
      (() => {
        const executable = options.executablePath ?? resolveCodexExecutable();
        return spawn(
          executable,
          [
            "app-server",
            "--stdio",
            "-c",
            'cli_auth_credentials_store="keyring"',
            "-c",
            'forced_login_method="chatgpt"',
          ],
          {
            env: createCodexProcessEnvironment(this.codexHome),
            stdio: ["pipe", "pipe", "pipe"],
            windowsHide: true,
          }
        );
      });
  }

  onNotification(listener: (method: string, params: unknown) => void) {
    this.events.on("notification", listener);
    return () => this.events.off("notification", listener);
  }

  onExit(listener: (error: Error) => void) {
    this.events.on("exit", listener);
    return () => this.events.off("exit", listener);
  }

  async request<T>(
    method: string,
    params?: unknown,
    timeoutMs = 30_000
  ): Promise<T> {
    await this.start();
    return this.sendRequest<T>(method, params, timeoutMs);
  }

  async start(): Promise<void> {
    if (this.starting) return this.starting;
    if (this.process) return;
    this.starting ??= this.startInner().finally(() => {
      this.starting = null;
    });
    return this.starting;
  }

  private async startInner() {
    this.stopping = false;
    mkdirSync(this.codexHome, { recursive: true, mode: 0o700 });
    writeManagedCodexConfig(this.codexHome);

    let child: CodexProcess;
    try {
      child = this.spawnProcess();
    } catch (error) {
      throw error instanceof Error
        ? error
        : new Error("Could not start the Codex runtime.");
    }
    this.process = child;

    const stdout = readline.createInterface({ input: child.stdout });
    stdout.on("line", (line) => this.handleLine(line));
    // Drain diagnostics without retaining them: app-server errors can contain
    // conversation or account context that must not cross into renderer errors.
    child.stderr.resume();

    child.stdin.on("error", (error) => {
      this.handleExit(child, error);
      if (!child.killed) {
        try {
          child.kill("SIGTERM");
        } catch {
          // The process already exited while its pipe error was delivered.
        }
      }
    });
    child.once("error", (error) => this.handleExit(child, error));
    child.once("exit", (code, signal) => {
      const suffix = signal ? ` (${signal})` : code == null ? "" : ` (${code})`;
      this.handleExit(child, new Error(`Codex stopped unexpectedly${suffix}.`));
    });

    try {
      await this.sendRequest(
        "initialize",
        {
          clientInfo: {
            name: "nimruz_desktop",
            title: "Nimruz Desktop",
            version: this.clientVersion,
          },
          capabilities: null,
        },
        15_000
      );
      this.send({ method: "initialized" });
    } catch (error) {
      this.dispose();
      throw error;
    }
  }

  private sendRequest<T>(method: string, params: unknown, timeoutMs: number) {
    const id = this.nextRequestId++;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Codex request timed out: ${method}`));
      }, timeoutMs);
      this.pending.set(id, {
        method,
        resolve: (value) => resolve(value as T),
        reject,
        timer,
      });
      try {
        this.send({
          method,
          id,
          ...(params === undefined ? {} : { params }),
        });
      } catch (error) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(
          error instanceof Error ? error : new Error("Could not contact Codex.")
        );
      }
    });
  }

  private send(message: RpcMessage) {
    if (!this.process?.stdin.writable) {
      throw new Error("Codex is not running.");
    }
    this.process.stdin.write(`${JSON.stringify(message)}\n`);
  }

  private handleLine(line: string) {
    let message: RpcMessage;
    try {
      message = JSON.parse(line) as RpcMessage;
    } catch {
      return;
    }

    if (message.method && message.id !== undefined) {
      this.send({
        id: message.id,
        error: {
          code: -32601,
          message: `Nimruz does not support server request ${message.method}.`,
        },
      });
      return;
    }

    if (message.method) {
      this.events.emit("notification", message.method, message.params);
      return;
    }

    if (message.id === undefined) return;
    const pending = this.pending.get(message.id);
    if (!pending) return;
    this.pending.delete(message.id);
    clearTimeout(pending.timer);
    if (message.error) {
      pending.reject(new CodexRpcError(pending.method, message.error));
    } else {
      pending.resolve(message.result);
    }
  }

  private handleExit(child: CodexProcess, error: Error) {
    // A process can emit `error` and then a delayed `exit`. If a new process
    // has already been started, the old event must not tear down its requests.
    if (this.process !== child) return;
    this.process = null;
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
    if (!this.stopping) this.events.emit("exit", error);
  }

  dispose() {
    this.stopping = true;
    const child = this.process;
    this.process = null;
    if (child && !child.killed) {
      try {
        child.kill("SIGTERM");
      } catch {
        // The process is already gone.
      }
    }
    const error = new Error("Codex was stopped.");
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
  }
}
