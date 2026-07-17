import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const FONT_CACHE_TTL_MS = 5 * 60 * 1000;

let cachedFonts: string[] | null = null;
let cacheExpiresAt = 0;

function dedupeSort(families: Iterable<string>): string[] {
  return [...new Set(families)]
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}

function parseFontLines(stdout: string): string[] {
  const families = new Set<string>();

  for (const line of stdout.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const primary = trimmed.split(",")[0]?.trim();
    if (primary) families.add(primary);
  }

  return dedupeSort(families);
}

function resolveFcListBinary(): string {
  for (const candidate of ["/usr/bin/fc-list", "/usr/local/bin/fc-list", "fc-list"]) {
    if (candidate === "fc-list" || existsSync(candidate)) {
      return candidate;
    }
  }
  return "fc-list";
}

async function listViaFcList(): Promise<string[]> {
  const binary = resolveFcListBinary();
  const { stdout } = await execFileAsync(binary, ["--format=%{family}\n"], {
    maxBuffer: 8 * 1024 * 1024,
    env: {
      ...process.env,
      PATH: process.env.PATH ?? "/usr/bin:/bin:/usr/local/bin",
    },
  });
  return parseFontLines(stdout);
}

async function listViaFcListPlain(): Promise<string[]> {
  const binary = resolveFcListBinary();
  const { stdout } = await execFileAsync(binary, [":", "family"], {
    maxBuffer: 8 * 1024 * 1024,
    env: {
      ...process.env,
      PATH: process.env.PATH ?? "/usr/bin:/bin:/usr/local/bin",
    },
  });
  return parseFontLines(stdout);
}

async function listLinuxFonts(): Promise<string[]> {
  try {
    const fonts = await listViaFcList();
    if (fonts.length > 0) return fonts;
  } catch (error) {
    console.warn("fc-list --format failed, trying plain mode:", error);
  }
  return listViaFcListPlain();
}

async function listMacFonts(): Promise<string[]> {
  try {
    const fonts = await listViaFcList();
    if (fonts.length > 0) return fonts;
  } catch {
    // Fall through to AppKit.
  }

  const script = [
    "use strict;",
    'ObjC.import("AppKit");',
    "const names = $.NSFontManager.sharedFontManager.availableFontFamilies;",
    "const result = [];",
    "for (let i = 0; i < names.count; i++) {",
    "  result.push(ObjC.unwrap(names.objectAtIndex(i)));",
    "}",
    "JSON.stringify(result.sort());",
  ].join(" ");
  const { stdout } = await execFileAsync("osascript", [
    "-l",
    "JavaScript",
    "-e",
    script,
  ]);
  const parsed = JSON.parse(stdout) as unknown;
  return Array.isArray(parsed)
    ? dedupeSort(
        parsed.filter((value): value is string => typeof value === "string")
      )
    : [];
}

async function listWindowsFonts(): Promise<string[]> {
  const script = [
    "Add-Type -AssemblyName System.Drawing",
    "$families = (New-Object System.Drawing.Text.InstalledFontCollection).Families",
    "$families | ForEach-Object { $_.Name }",
  ].join("; ");
  const { stdout } = await execFileAsync("powershell.exe", [
    "-NoProfile",
    "-Command",
    script,
  ]);
  return parseFontLines(stdout);
}

export async function listInstalledFonts(): Promise<string[]> {
  const now = Date.now();
  if (cachedFonts && now < cacheExpiresAt) {
    return cachedFonts;
  }

  let fonts: string[] = [];

  try {
    if (process.platform === "linux") {
      fonts = await listLinuxFonts();
    } else if (process.platform === "darwin") {
      fonts = await listMacFonts();
    } else if (process.platform === "win32") {
      fonts = await listWindowsFonts();
    }
  } catch (error) {
    console.error("Failed to enumerate system fonts:", error);
    fonts = [];
  }

  console.log(`[fonts] enumerated ${fonts.length} families on ${process.platform}`);
  cachedFonts = fonts;
  cacheExpiresAt = now + FONT_CACHE_TTL_MS;
  return fonts;
}
