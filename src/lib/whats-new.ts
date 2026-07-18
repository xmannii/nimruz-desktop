import {
  entriesNewerThan,
  findChangelogEntry,
  type ChangelogEntry,
} from "@/lib/changelog";
import { isNewerVersion, normalizeVersion } from "@/lib/updates";

export const LAST_SEEN_VERSION_STORAGE_KEY = "nimruz:last-seen-version";

function readLegacyLastSeenVersion(): string | null {
  try {
    const value = localStorage.getItem(LAST_SEEN_VERSION_STORAGE_KEY);
    if (!value) return null;
    const normalized = normalizeVersion(value);
    return normalized || null;
  } catch {
    return null;
  }
}

export async function getLastSeenVersion(): Promise<string | null> {
  try {
    const value = await window.desktop.storage.loadLastSeenVersion();
    if (value) {
      const normalized = normalizeVersion(value);
      return normalized || null;
    }
  } catch {
    // Fall back to the legacy renderer preference.
  }

  const legacy = readLegacyLastSeenVersion();
  if (legacy) {
    void window.desktop.storage
      .saveLastSeenVersion(legacy)
      .catch(() => undefined);
  }
  return legacy;
}

export async function markVersionSeen(version: string): Promise<void> {
  const normalized = normalizeVersion(version);
  if (!normalized) return;

  try {
    localStorage.setItem(LAST_SEEN_VERSION_STORAGE_KEY, normalized);
  } catch {
    // SQLite remains the durable source of truth.
  }

  try {
    await window.desktop.storage.saveLastSeenVersion(normalized);
  } catch {
    // Ignore quota / private mode / bridge failures.
  }
}

/**
 * First install: seed silently so onboarding does not lead into “what’s new”.
 * Call while onboarding has not completed yet.
 */
export async function seedLastSeenVersionIfNeeded(currentVersion: string) {
  if ((await getLastSeenVersion()) !== null) return;
  await markVersionSeen(currentVersion);
}

/**
 * Show after onboarding is done when the installed version is newer than the
 * last acknowledged one. If there is no last-seen marker yet (upgrade into a
 * build that introduced this feature), treat as “show current release notes”.
 */
export async function shouldShowWhatsNew(
  currentVersion: string
): Promise<boolean> {
  const current = normalizeVersion(currentVersion);
  if (!current) return false;

  const lastSeen = await getLastSeenVersion();
  if (lastSeen === null) return true;
  return isNewerVersion(current, lastSeen);
}

/**
 * Resolve which changelog entries to show for an upgrade prompt.
 * - Known last-seen: every entry newer than that version
 * - Unknown last-seen: just the current version (if present in the changelog)
 */
export function resolveWhatsNewEntries(
  currentVersion: string,
  lastSeenVersion: string | null,
  changelog: ChangelogEntry[]
): ChangelogEntry[] {
  const current = normalizeVersion(currentVersion);
  if (!current) return [];

  if (lastSeenVersion) {
    return entriesNewerThan(changelog, lastSeenVersion);
  }

  const currentEntry = findChangelogEntry(changelog, current);
  return currentEntry ? [currentEntry] : [];
}
