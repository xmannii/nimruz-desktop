import { spawn } from "node:child_process";
import path from "node:path";
import { resolveInsideRoots } from "./path-policy";

const MAX_OUTPUT_BYTES = 256 * 1024;
const MAX_LIVE_OUTPUT_BYTES_PER_STREAM = 32 * 1024;
const DEFAULT_TIMEOUT_MS = 5 * 60_000;
const OUTPUT_UPDATE_INTERVAL_MS = 100;

const BLOCKED_PATTERNS = [
  /rm\s+-[a-z]*[rf][a-z]*\s+\/(\s|$|\*)/i,
  /rm\s+-[a-z]*[rf][a-z]*\s+\/\w/i,
  /mkfs\./i,
  /dd\s+if=/i,
  /:\(\)\s*\{\s*:\|:\s*&\s*\};:/,
  /curl\s+[^\n]*\|\s*(ba)?sh/i,
  /wget\s+[^\n]*\|\s*(ba)?sh/i,
];

export type ShellResult = {
  status: "running" | "completed";
  command: string;
  cwd: string;
  exitCode: number | null;
  signal: string | null;
  stdout: string;
  stderr: string;
  truncated: boolean;
  liveTruncated: boolean;
  timedOut: boolean;
  durationMs: number;
};

type RunScopedCommandOptions = {
  command: string;
  cwd: string;
  roots: string[];
  timeoutMs?: number;
  abortSignal?: AbortSignal;
  envAllowlist?: string[];
  onUpdate?: (result: ShellResult) => void;
};

export function assertCommandAllowed(command: string) {
  const trimmed = command.trim();
  if (!trimmed) {
    throw new Error("Command is empty.");
  }
  if (trimmed.length > 8_000) {
    throw new Error("Command is too long.");
  }
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(trimmed)) {
      throw new Error("Command matches a blocked dangerous pattern.");
    }
  }
}

export async function runScopedCommand(
  options: RunScopedCommandOptions
): Promise<ShellResult> {
  assertCommandAllowed(options.command);
  const { absolutePath: cwd } = resolveInsideRoots(options.cwd, options.roots);
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const allow = new Set(
    options.envAllowlist ?? [
      "PATH",
      "HOME",
      "USER",
      "LANG",
      "LC_ALL",
      "TERM",
      "TMPDIR",
      "TMP",
      "TEMP",
    ]
  );
  const env: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (allow.has(key) && typeof value === "string") {
      env[key] = value;
    }
  }
  env.NIMRUZ_WORKSPACE = cwd;

  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const isWindows = process.platform === "win32";
    const child = spawn(
      isWindows ? "cmd.exe" : "/bin/bash",
      isWindows ? ["/d", "/s", "/c", options.command] : ["-c", options.command],
      {
        cwd,
        env,
        stdio: ["ignore", "pipe", "pipe"],
      }
    );

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let stdoutLength = 0;
    let stderrLength = 0;
    let truncated = false;
    let timedOut = false;
    let settled = false;
    let killRequested = false;
    let updateTimer: NodeJS.Timeout | null = null;

    const createResult = (
      status: ShellResult["status"],
      exitCode: number | null = null,
      signal: string | null = null
    ): ShellResult => {
      const stdout = Buffer.concat(stdoutChunks);
      const stderr = Buffer.concat(stderrChunks);
      const isRunning = status === "running";
      const liveTruncated =
        isRunning &&
        (stdout.length > MAX_LIVE_OUTPUT_BYTES_PER_STREAM ||
          stderr.length > MAX_LIVE_OUTPUT_BYTES_PER_STREAM);
      const visibleStdout =
        isRunning && stdout.length > MAX_LIVE_OUTPUT_BYTES_PER_STREAM
          ? stdout.subarray(-MAX_LIVE_OUTPUT_BYTES_PER_STREAM)
          : stdout;
      const visibleStderr =
        isRunning && stderr.length > MAX_LIVE_OUTPUT_BYTES_PER_STREAM
          ? stderr.subarray(-MAX_LIVE_OUTPUT_BYTES_PER_STREAM)
          : stderr;

      return {
        status,
        command: options.command,
        cwd,
        exitCode,
        signal,
        stdout: visibleStdout.toString("utf8"),
        stderr: visibleStderr.toString("utf8"),
        truncated,
        liveTruncated,
        timedOut,
        durationMs: Date.now() - startedAt,
      };
    };

    const emitUpdate = () => {
      updateTimer = null;
      options.onUpdate?.(createResult("running"));
    };

    const scheduleUpdate = () => {
      if (!options.onUpdate || updateTimer) return;
      updateTimer = setTimeout(emitUpdate, OUTPUT_UPDATE_INTERVAL_MS);
    };

    const append = (
      chunks: Buffer[],
      currentLength: number,
      chunk: Buffer
    ): number => {
      if (currentLength >= MAX_OUTPUT_BYTES) {
        truncated = true;
        return currentLength;
      }
      const remaining = MAX_OUTPUT_BYTES - currentLength;
      if (chunk.length > remaining) {
        truncated = true;
        chunks.push(chunk.subarray(0, remaining));
        return MAX_OUTPUT_BYTES;
      }
      chunks.push(chunk);
      return currentLength + chunk.length;
    };

    child.stdout?.on("data", (chunk: Buffer) => {
      stdoutLength = append(stdoutChunks, stdoutLength, chunk);
      scheduleUpdate();
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderrLength = append(stderrChunks, stderrLength, chunk);
      scheduleUpdate();
    });

    options.onUpdate?.(createResult("running"));

    const safeKill = (signal: NodeJS.Signals) => {
      killRequested = true;
      try {
        if (!child.killed) child.kill(signal);
      } catch {
        // Process may already be gone, or the platform/sandbox may refuse
        // to signal it (e.g. EACCES/EPERM). Treat as best-effort.
      }
    };

    const killTree = () => {
      safeKill("SIGTERM");
      setTimeout(() => safeKill("SIGKILL"), 2_000).unref?.();
    };

    const timer = setTimeout(() => {
      timedOut = true;
      killTree();
    }, timeoutMs);

    const onAbort = () => {
      killTree();
    };
    options.abortSignal?.addEventListener("abort", onAbort, { once: true });

    child.on("error", (error) => {
      if (settled) return;
      // A failed kill attempt (e.g. EACCES/EPERM/ESRCH in a restricted
      // sandbox) surfaces as a late 'error' event. Ignore it and let the
      // process finish so 'close' can resolve with the timed-out flag.
      if (killRequested) return;
      settled = true;
      clearTimeout(timer);
      if (updateTimer) clearTimeout(updateTimer);
      options.abortSignal?.removeEventListener("abort", onAbort);
      reject(error);
    });

    child.on("close", (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (updateTimer) clearTimeout(updateTimer);
      options.abortSignal?.removeEventListener("abort", onAbort);
      resolve(createResult("completed", code, signal));
    });
  });
}

/** Streams coalesced command snapshots and yields the completed result last. */
export async function* streamScopedCommand(
  options: Omit<RunScopedCommandOptions, "onUpdate">
): AsyncGenerator<ShellResult> {
  let latestUpdate: ShellResult | null = null;
  let finalResult: ShellResult | null = null;
  let finalError: unknown;
  let settled = false;
  let wake: (() => void) | null = null;

  const notify = () => {
    wake?.();
    wake = null;
  };

  void runScopedCommand({
    ...options,
    onUpdate: (result) => {
      latestUpdate = result;
      notify();
    },
  }).then(
    (result) => {
      finalResult = result;
      settled = true;
      notify();
    },
    (error: unknown) => {
      finalError = error;
      settled = true;
      notify();
    }
  );

  while (!settled) {
    if (latestUpdate) {
      const update = latestUpdate;
      latestUpdate = null;
      yield update;
      continue;
    }
    await new Promise<void>((resolve) => {
      wake = resolve;
    });
  }

  if (finalError) throw finalError;
  if (finalResult) yield finalResult;
}

export function defaultShellCwd(roots: string[]): string {
  if (!roots.length) {
    throw new Error("No workspace roots available for shell.");
  }
  return path.resolve(roots[0]);
}
