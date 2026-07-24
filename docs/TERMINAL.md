# Workspace terminal and test runner

Nimruz provides a real pseudo-terminal (PTY) for the selected workspace or
chat worktree. On Windows it uses ConPTY with PowerShell; on macOS and Linux it
uses the user's login shell. This is an interactive user terminal, not a
simulated command log.

## Scope and lifecycle

- The starting directory is the workspace's primary linked folder, or the
  isolated worktree folder for a worktree-enabled chat.
- Shell and test processes live in Electron's main process, so switching panels
  or reloading the renderer does not terminate them.
- Sessions end when explicitly closed or when Nimruz exits. They are not
  restored after an application restart.
- Completed Windows sessions release their ConPTY output worker immediately;
  the bounded output snapshot remains available without keeping Electron or the
  test runner alive.
- Nimruz retains at most 250,000 output characters per session for reattachment
  and allows at most eight simultaneous sessions.

The terminal is intentionally an explicit user-controlled shell. It starts in
the approved workspace but can access anything the operating-system user can
access; the agent's workspace sandbox does not apply to commands typed by the
user. To avoid leaking model or service credentials to child processes, Nimruz
passes a small allowlist of normal operating-system environment variables and
adds `NIMRUZ_WORKSPACE`.

On Windows, PowerShell starts with `-NoProfile`. This makes startup deterministic
and prevents a user profile from blocking the ConPTY handshake. Commands typed
in the terminal still have normal PowerShell behavior.

## Test runner

The test selector reads the primary folder's `package.json`. It exposes only
scripts whose names contain `test`, `check`, `lint`, `typecheck`, or `build`.
Script names must contain only letters, digits, `_`, `.`, `:`, or `-`. The
selected script is run through the lockfile-detected package manager (`pnpm`,
`yarn`, `bun`, or `npm`) inside the same PTY, so colors, progress, failures, and
exit codes are real.

Nimruz does not invent framework-specific test commands, parse arbitrary
renderer-provided commands, or claim that a test passed based on text output.
The process exit code is shown on the session tab.

## Verification

The terminal tests spawn actual PTYs and verify both paths:

```bash
pnpm exec tsx --test electron/terminal/manager.test.ts
```

One test discovers and executes a real package script in a temporary workspace.
The other starts an interactive shell, writes a command through the PTY input
channel, observes its output, and waits for the real zero exit status.
