import { isNewerVersion, normalizeVersion } from "@/lib/updates";

export type ChangelogEntry = {
  version: string;
  date: string | null;
  body: string;
};

const VERSION_HEADING =
  /^##\s+\[([^\]]+)\](?:\s*[—–-]\s*(\d{4}-\d{2}-\d{2}))?\s*$/gm;

/** Parse Keep-a-Changelog style markdown into version entries (newest first). */
export function parseChangelog(markdown: string): ChangelogEntry[] {
  const matches = [...markdown.matchAll(VERSION_HEADING)];
  if (matches.length === 0) return [];

  const entries: ChangelogEntry[] = [];

  for (let i = 0; i < matches.length; i += 1) {
    const match = matches[i]!;
    const version = match[1]?.trim();
    if (!version) continue;

    const start = (match.index ?? 0) + match[0].length;
    const end = matches[i + 1]?.index ?? markdown.length;
    let body = markdown.slice(start, end).trim();

    // Drop footer reference links that often follow the last entry.
    body = body
      .replace(/\n\[([^\]]+)\]:\s+\S+/g, "")
      .replace(/^\[([^\]]+)\]:\s+\S+\s*$/gm, "")
      .trim();

    entries.push({
      version: normalizeVersion(version),
      date: match[2] ?? null,
      body,
    });
  }

  return entries;
}

/** Entries strictly newer than `sinceVersion` (newest first). */
export function entriesNewerThan(
  entries: ChangelogEntry[],
  sinceVersion: string
): ChangelogEntry[] {
  return entries.filter((entry) => isNewerVersion(entry.version, sinceVersion));
}

/**
 * Prefer the “what’s new” block when present; otherwise return the full body.
 * Useful for compact upgrade dialogs.
 */
export function entryHighlights(body: string): string {
  const match = body.match(
    /###\s+(?:Highlights|نکات برجسته|چی جدیده\؟?)\s*\n([\s\S]*?)(?=\n###\s|\n##\s|$)/i
  );
  const highlights = match?.[1]?.trim();
  return highlights && highlights.length > 0 ? highlights : body.trim();
}

export function findChangelogEntry(
  entries: ChangelogEntry[],
  version: string
): ChangelogEntry | null {
  const normalized = normalizeVersion(version);
  return entries.find((entry) => entry.version === normalized) ?? null;
}
