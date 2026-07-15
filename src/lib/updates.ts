export type UpdatePlatform = "darwin" | "win32" | "linux" | string;

export type ReleaseAsset = {
  name: string;
  browser_download_url: string;
};

export type UpdateCheckResult =
  | {
      status: "up-to-date";
      currentVersion: string;
      latestVersion: string;
    }
  | {
      status: "available";
      currentVersion: string;
      latestVersion: string;
      releaseUrl: string;
      downloadUrl: string | null;
      releaseNotes: string | null;
      publishedAt: string | null;
    }
  | {
      status: "error";
      currentVersion: string;
      message: string;
    };

/** Strip a leading `v` and any pre-release / build metadata for numeric compare. */
export function normalizeVersion(version: string): string {
  return version.trim().replace(/^v/i, "").split(/[-+]/)[0] ?? "";
}

export function parseSemver(
  version: string
): [number, number, number] | null {
  const normalized = normalizeVersion(version);
  if (!normalized) return null;

  const parts = normalized.split(".");
  if (parts.length === 0 || parts.some((part) => part === "" || !/^\d+$/.test(part))) {
    return null;
  }

  return [
    Number(parts[0] ?? 0),
    Number(parts[1] ?? 0),
    Number(parts[2] ?? 0),
  ];
}

/** Returns true when `remote` is a higher semver than `current`. */
export function isNewerVersion(remote: string, current: string): boolean {
  const a = parseSemver(remote);
  const b = parseSemver(current);
  if (!a || !b) return false;

  for (let i = 0; i < 3; i += 1) {
    if (a[i]! > b[i]!) return true;
    if (a[i]! < b[i]!) return false;
  }
  return false;
}

const PLATFORM_EXTENSIONS: Record<string, string[]> = {
  darwin: [".dmg"],
  win32: [".exe"],
  linux: [".AppImage", ".deb", ".rpm"],
};

/**
 * Prefer a platform-matching release asset; fall back to null so callers can
 * open the release page instead.
 */
export function pickReleaseAsset(
  assets: ReleaseAsset[],
  platform: UpdatePlatform,
  arch = "x64"
): ReleaseAsset | null {
  const extensions = PLATFORM_EXTENSIONS[platform];
  if (!extensions || assets.length === 0) return null;

  const matching = assets.filter((asset) => {
    const name = asset.name.toLowerCase();
    return extensions.some((ext) => name.endsWith(ext.toLowerCase()));
  });

  if (matching.length === 0) return null;
  if (matching.length === 1) return matching[0] ?? null;

  const archHints =
    arch === "arm64"
      ? ["arm64", "aarch64"]
      : arch === "x64"
        ? ["x64", "x86_64", "amd64"]
        : [arch];

  const archMatch = matching.find((asset) => {
    const name = asset.name.toLowerCase();
    return archHints.some((hint) => name.includes(hint));
  });

  return archMatch ?? matching[0] ?? null;
}

export const DISMISSED_UPDATE_STORAGE_KEY = "nimruz:dismissed-update-version";
