import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { nanoid } from "nanoid";
import * as pty from "node-pty";
import type {
  TerminalEvent,
  TerminalSession,
  WorkspaceTestScript,
} from "@/lib/terminal";
import { TERMINAL_EVENT_CHANNEL } from "@/lib/terminal";
import type { WorkspaceFilesStore } from "../agent/workspace-files";

export { TERMINAL_EVENT_CHANNEL };
const MAX_SESSIONS = 8;
const MAX_OUTPUT_CHARS = 250_000;
const MAX_INPUT_CHARS = 8_192;
const TEST_SCRIPT_PATTERN = /(^|:)(test|check|lint|typecheck|build)(:|$)/i;
const SAFE_SCRIPT_NAME_PATTERN = /^[A-Za-z0-9_.:-]+$/;

type ManagedSession = {
  value: TerminalSession;
  process: pty.IPty;
};

function terminalEnvironment(cwd: string): Record<string, string> {
  const allowed = new Set([
    "PATH",
    "PATHEXT",
    "SystemRoot",
    "ComSpec",
    "USERPROFILE",
    "HOME",
    "USER",
    "USERNAME",
    "APPDATA",
    "LOCALAPPDATA",
    "LANG",
    "LC_ALL",
    "TERM",
    "TMPDIR",
    "TMP",
    "TEMP",
  ].map((key) => key.toLowerCase()));
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (allowed.has(key.toLowerCase()) && typeof value === "string") {
      env[key] = value;
    }
  }
  env.NIMRUZ_WORKSPACE = cwd;
  env.TERM = env.TERM || "xterm-256color";
  return env;
}

function shellCommand(): { file: string; args: string[] } {
  if (process.platform === "win32") {
    // User profiles can block startup or mutate the environment unexpectedly.
    return { file: "pwsh.exe", args: ["-NoLogo", "-NoProfile"] };
  }
  return {
    file: process.env.SHELL || "/bin/bash",
    args: ["-l"],
  };
}

function packageManager(cwd: string) {
  if (existsSync(path.join(cwd, "pnpm-lock.yaml"))) return "pnpm";
  if (existsSync(path.join(cwd, "yarn.lock"))) return "yarn";
  if (existsSync(path.join(cwd, "bun.lockb"))) return "bun";
  return "npm";
}

/**
 * Owns real OS pseudo-terminals. Sessions remain alive while the renderer
 * reloads; bounded output snapshots let a newly mounted terminal reattach.
 */
export class WorkspaceTerminalManager {
  readonly #files: WorkspaceFilesStore;
  readonly #emit: (event: TerminalEvent) => void;
  readonly #sessions = new Map<string, ManagedSession>();

  constructor(
    files: WorkspaceFilesStore,
    emit: (event: TerminalEvent) => void
  ) {
    this.#files = files;
    this.#emit = emit;
  }

  list(workspaceId: string, chatId?: string): TerminalSession[] {
    return [...this.#sessions.values()]
      .map((session) => ({ ...session.value }))
      .filter(
        (session) =>
          session.workspaceId === workspaceId &&
          session.chatId === (chatId ?? null)
      )
      .sort((a, b) => a.createdAt - b.createdAt);
  }

  listTestScripts(workspaceId: string, chatId?: string): WorkspaceTestScript[] {
    const cwd = this.#files.primaryRootPath(workspaceId, chatId);
    const packageJson = path.join(cwd, "package.json");
    if (!existsSync(packageJson)) return [];
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(packageJson, "utf8"));
    } catch {
      return [];
    }
    const scripts =
      parsed && typeof parsed === "object"
        ? (parsed as { scripts?: unknown }).scripts
        : null;
    if (!scripts || typeof scripts !== "object" || Array.isArray(scripts)) {
      return [];
    }
    return Object.entries(scripts)
      .filter(
        (entry): entry is [string, string] =>
          typeof entry[1] === "string" &&
          entry[0].length <= 128 &&
          SAFE_SCRIPT_NAME_PATTERN.test(entry[0]) &&
          TEST_SCRIPT_PATTERN.test(entry[0])
      )
      .slice(0, 50)
      .map(([name, command]) => ({ name, command }));
  }

  startShell(options: {
    workspaceId: string;
    chatId?: string;
    cols?: number;
    rows?: number;
  }): TerminalSession {
    const cwd = this.#files.primaryRootPath(
      options.workspaceId,
      options.chatId
    );
    const shell = shellCommand();
    return this.#start({
      workspaceId: options.workspaceId,
      chatId: options.chatId,
      cwd,
      kind: "shell",
      title: path.basename(cwd) || "Terminal",
      file: shell.file,
      args: shell.args,
      cols: options.cols,
      rows: options.rows,
    });
  }

  startTest(options: {
    workspaceId: string;
    chatId?: string;
    script: string;
    cols?: number;
    rows?: number;
  }): TerminalSession {
    const scripts = this.listTestScripts(options.workspaceId, options.chatId);
    if (!scripts.some((script) => script.name === options.script)) {
      throw new Error("Unknown or unsupported test script.");
    }
    const cwd = this.#files.primaryRootPath(
      options.workspaceId,
      options.chatId
    );
    const manager = packageManager(cwd);
    const command =
      process.platform === "win32"
        ? {
            file: "cmd.exe",
            args: ["/d", "/s", "/c", manager, "run", options.script],
          }
        : {
            file: "/usr/bin/env",
            args: [manager, "run", options.script],
          };
    return this.#start({
      workspaceId: options.workspaceId,
      chatId: options.chatId,
      cwd,
      kind: "test",
      title: `${manager} run ${options.script}`,
      ...command,
      cols: options.cols,
      rows: options.rows,
    });
  }

  #start(options: {
    workspaceId: string;
    chatId?: string;
    cwd: string;
    kind: TerminalSession["kind"];
    title: string;
    file: string;
    args: string[];
    cols?: number;
    rows?: number;
  }): TerminalSession {
    if (this.#sessions.size >= MAX_SESSIONS) {
      throw new Error(`At most ${MAX_SESSIONS} terminal sessions may be open.`);
    }
    const id = nanoid();
    const processHandle = pty.spawn(options.file, options.args, {
      name: "xterm-256color",
      cwd: options.cwd,
      env: terminalEnvironment(options.cwd),
      cols: Math.min(Math.max(options.cols ?? 100, 20), 400),
      rows: Math.min(Math.max(options.rows ?? 30, 5), 200),
      useConpty: process.platform === "win32",
    });
    const value: TerminalSession = {
      id,
      workspaceId: options.workspaceId,
      chatId: options.chatId ?? null,
      kind: options.kind,
      title: options.title,
      cwd: options.cwd,
      status: "running",
      exitCode: null,
      output: "",
      createdAt: Date.now(),
    };
    const managed: ManagedSession = { value, process: processHandle };
    this.#sessions.set(id, managed);
    processHandle.onData((data) => {
      value.output = `${value.output}${data}`.slice(-MAX_OUTPUT_CHARS);
      this.#emit({ type: "data", sessionId: id, data });
    });
    processHandle.onExit(({ exitCode }) => {
      value.status = "exited";
      value.exitCode = exitCode;
      this.#emit({ type: "exit", sessionId: id, exitCode });
    });
    return { ...value };
  }

  write(sessionId: string, data: string) {
    const session = this.#sessions.get(sessionId);
    if (!session || session.value.status !== "running") {
      throw new Error("Terminal session is not running.");
    }
    if (typeof data !== "string" || data.length > MAX_INPUT_CHARS) {
      throw new Error("Terminal input is too large.");
    }
    session.process.write(data);
  }

  resize(sessionId: string, cols: number, rows: number) {
    const session = this.#sessions.get(sessionId);
    if (!session || session.value.status !== "running") return;
    session.process.resize(
      Math.min(Math.max(Math.floor(cols), 20), 400),
      Math.min(Math.max(Math.floor(rows), 5), 200)
    );
  }

  close(sessionId: string) {
    const session = this.#sessions.get(sessionId);
    if (!session) return;
    if (session.value.status === "running") session.process.kill();
    this.#sessions.delete(sessionId);
  }

  dispose() {
    for (const id of [...this.#sessions.keys()]) this.close(id);
  }
}
