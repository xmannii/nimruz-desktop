import {
  entriesNewerThan,
  findChangelogEntry,
  type ChangelogEntry,
} from "@/lib/changelog";
import { isNewerVersion, normalizeVersion } from "@/lib/updates";

export const LAST_SEEN_VERSION_STORAGE_KEY = "nimruz:last-seen-version";

export function getLastSeenVersion(): string | null {
  try {
    const value = localStorage.getItem(LAST_SEEN_VERSION_STORAGE_KEY);
    if (!value) return null;
    const normalized = normalizeVersion(value);
    return normalized || null;
  } catch {
    return null;
  }
}

export function markVersionSeen(version: string) {
  try {
    const normalized = normalizeVersion(version);
    if (!normalized) return;
    localStorage.setItem(LAST_SEEN_VERSION_STORAGE_KEY, normalized);
  } catch {
    // Ignore quota / private mode failures.
  }
}

/**
 * First install: seed silently so onboarding does not lead into “what’s new”.
 * Call while onboarding has not completed yet.
 */
export function seedLastSeenVersionIfNeeded(currentVersion: string) {
  if (getLastSeenVersion() !== null) return;
  markVersionSeen(currentVersion);
}

/**
 * Show after onboarding is done when the installed version is newer than the
 * last acknowledged one. If there is no last-seen marker yet (upgrade into a
 * build that introduced this feature), treat as “show current release notes”.
 */
export function shouldShowWhatsNew(currentVersion: string): boolean {
  const current = normalizeVersion(currentVersion);
  if (!current) return false;

  const lastSeen = getLastSeenVersion();
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
