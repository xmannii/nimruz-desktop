import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const electronPath = require("electron");

delete process.env.ELECTRON_RUN_AS_NODE;

const userArgs = process.argv.slice(2);
const electronArgs = [];

// Manual/pnpm installs often lack root-owned chrome-sandbox (mode 4755) on Linux.
if (process.platform === "linux" && !process.env.ELECTRON_FORCE_SANDBOX) {
  electronArgs.push("--no-sandbox");
}

electronArgs.push(...(userArgs.length > 0 ? userArgs : ["."]));

const child = spawn(electronPath, electronArgs, {
  stdio: "inherit",
  env: process.env,
  cwd: path.resolve(import.meta.dirname, ".."),
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.exit(1);
    return;
  }
  process.exit(code ?? 0);
});
