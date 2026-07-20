import assert from "node:assert/strict";
import { mkdtemp, mkdir, realpath, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { resolveCodexExecutable } from "./runtime";

async function writePackageJson(directory: string, name: string) {
  await mkdir(directory, { recursive: true });
  await writeFile(
    path.join(directory, "package.json"),
    JSON.stringify({ name, version: "1.0.0" }),
    "utf8"
  );
}

test("rejects unsupported Codex platform and architecture pairs", () => {
  assert.throws(
    () => resolveCodexExecutable({ platform: "aix", arch: "ppc64" }),
    /Codex is not available for aix\/ppc64/
  );
});

test("reports a missing bundled root Codex package", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "nimruz-runtime-empty-"));
  try {
    const requireFrom = {
      resolve() {
        throw new Error("missing");
      },
    } as unknown as NodeRequire;
    assert.throws(
      () =>
        resolveCodexExecutable({
          platform: "linux",
          arch: "x64",
          requireFrom,
        }),
      /bundled Codex runtime is missing/
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("reports a missing target-specific optional package", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "nimruz-runtime-root-"));
  try {
    const missingPlatform: NodeJS.Platform =
      process.platform === "win32" ? "linux" : "win32";
    await writePackageJson(
      path.join(directory, "node_modules", "@openai", "codex"),
      "@openai/codex"
    );
    const requireFrom = createRequire(path.join(directory, "entry.cjs"));
    assert.throws(
      () =>
        resolveCodexExecutable({
          platform: missingPlatform,
          arch: "x64",
          requireFrom,
        }),
      new RegExp(`runtime for ${missingPlatform}/x64 is missing`)
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("resolves the target executable from the nested optional package", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "nimruz-runtime-ok-"));
  try {
    const codexPackage = path.join(
      directory,
      "node_modules",
      "@openai",
      "codex"
    );
    const platformPackage = path.join(
      codexPackage,
      "node_modules",
      "@openai",
      "codex-linux-x64"
    );
    const executable = path.join(
      platformPackage,
      "vendor",
      "x86_64-unknown-linux-musl",
      "bin",
      "codex"
    );
    await writePackageJson(codexPackage, "@openai/codex");
    await writePackageJson(platformPackage, "@openai/codex-linux-x64");
    await mkdir(path.dirname(executable), { recursive: true });
    await writeFile(executable, "test executable", "utf8");

    const resolved = resolveCodexExecutable({
      platform: "linux",
      arch: "x64",
      requireFrom: createRequire(path.join(directory, "entry.cjs")),
    });
    assert.equal(resolved, await realpath(executable));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("prefers the unpacked executable when dependencies live inside app.asar", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "nimruz-runtime-asar-"));
  try {
    const asarRoot = path.join(directory, "app.asar");
    const codexPackage = path.join(
      asarRoot,
      "node_modules",
      "@openai",
      "codex"
    );
    const platformPackage = path.join(
      codexPackage,
      "node_modules",
      "@openai",
      "codex-win32-x64"
    );
    const unpackedExecutable = path.join(
      directory,
      "app.asar.unpacked",
      "node_modules",
      "@openai",
      "codex",
      "node_modules",
      "@openai",
      "codex-win32-x64",
      "vendor",
      "x86_64-pc-windows-msvc",
      "bin",
      "codex.exe"
    );
    await writePackageJson(codexPackage, "@openai/codex");
    await writePackageJson(platformPackage, "@openai/codex-win32-x64");
    await mkdir(path.dirname(unpackedExecutable), { recursive: true });
    await writeFile(unpackedExecutable, "test executable", "utf8");

    const resolved = resolveCodexExecutable({
      platform: "win32",
      arch: "x64",
      requireFrom: createRequire(path.join(asarRoot, "entry.cjs")),
    });
    assert.equal(resolved, await realpath(unpackedExecutable));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
