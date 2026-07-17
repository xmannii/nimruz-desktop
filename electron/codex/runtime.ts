import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

type CodexTarget = {
  packageName: string;
  triple: string;
  executable: string;
};

const TARGETS: Record<string, CodexTarget> = {
  "linux:x64": {
    packageName: "@openai/codex-linux-x64",
    triple: "x86_64-unknown-linux-musl",
    executable: "codex",
  },
  "linux:arm64": {
    packageName: "@openai/codex-linux-arm64",
    triple: "aarch64-unknown-linux-musl",
    executable: "codex",
  },
  "darwin:x64": {
    packageName: "@openai/codex-darwin-x64",
    triple: "x86_64-apple-darwin",
    executable: "codex",
  },
  "darwin:arm64": {
    packageName: "@openai/codex-darwin-arm64",
    triple: "aarch64-apple-darwin",
    executable: "codex",
  },
  "win32:x64": {
    packageName: "@openai/codex-win32-x64",
    triple: "x86_64-pc-windows-msvc",
    executable: "codex.exe",
  },
  "win32:arm64": {
    packageName: "@openai/codex-win32-arm64",
    triple: "aarch64-pc-windows-msvc",
    executable: "codex.exe",
  },
};

function unpackedAsarPath(value: string) {
  const marker = `${path.sep}app.asar${path.sep}`;
  return value.includes(marker)
    ? value.replace(marker, `${path.sep}app.asar.unpacked${path.sep}`)
    : value;
}

export function resolveCodexExecutable(options?: {
  platform?: NodeJS.Platform;
  arch?: string;
  requireFrom?: NodeRequire;
}) {
  const platform = options?.platform ?? process.platform;
  const arch = options?.arch ?? process.arch;
  const target = TARGETS[`${platform}:${arch}`];
  if (!target) {
    throw new Error(`Codex is not available for ${platform}/${arch}.`);
  }

  const rootRequire = options?.requireFrom ?? createRequire(import.meta.url);
  let codexPackageJson: string;
  try {
    codexPackageJson = rootRequire.resolve("@openai/codex/package.json");
  } catch {
    throw new Error("The bundled Codex runtime is missing. Reinstall Nimruz.");
  }

  const codexRequire = createRequire(codexPackageJson);
  let platformPackageJson: string;
  try {
    platformPackageJson = codexRequire.resolve(
      `${target.packageName}/package.json`
    );
  } catch {
    throw new Error(
      `The Codex runtime for ${platform}/${arch} is missing. Reinstall Nimruz.`
    );
  }

  const packagedPath = path.join(
    path.dirname(platformPackageJson),
    "vendor",
    target.triple,
    "bin",
    target.executable
  );
  const candidates = [unpackedAsarPath(packagedPath), packagedPath];
  const executable = candidates.find((candidate) => existsSync(candidate));
  if (!executable) {
    throw new Error(
      `The Codex executable for ${platform}/${arch} was not packaged correctly.`
    );
  }
  return executable;
}
