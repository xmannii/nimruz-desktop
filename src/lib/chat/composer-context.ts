/**
 * Helpers for `@` workspace-file/folder mentions in the chat composer. Mentions
 * are stored inline in the message text as `@<path>` tokens so they travel as
 * durable references the agent resolves with its file tools.
 */

import type { FileCategory } from "@/lib/workspace";

/** Special mention referring to the whole workspace. */
export const WORKSPACE_MENTION = "workspace";

/**
 * A file the user uploaded through the composer. Uploaded files are shown as
 * attachment cards above the input (not injected as `@` tokens in the text) and
 * are attached to the agent at submit time: images become file parts for vision
 * models, other files become durable `@path` references the agent reads.
 */
export type ComposerAttachment = {
  id: string;
  name: string;
  relativePath: string;
  mimeType: string;
  category: FileCategory;
  sizeBytes: number;
  /** Data URL for images so they can be sent as file parts to vision models. */
  dataUrl?: string;
};

export function isImageMimeType(mimeType: string | undefined): boolean {
  return Boolean(mimeType?.startsWith("image/"));
}

/**
 * Returns the active `@` mention query at the end of the text, or null when the
 * caret is not composing a mention. Matches an `@` that starts the text or
 * follows whitespace, capturing everything up to the end.
 */
export function getMentionQuery(text: string): string | null {
  const match = text.match(/(?:^|\s)@([^\s@]*)$/);
  return match ? match[1] : null;
}

/** Splits a mention query into its directory prefix and trailing name filter. */
export function splitMentionQuery(query: string): {
  dir: string;
  name: string;
} {
  const idx = query.lastIndexOf("/");
  if (idx < 0) return { dir: ".", name: query };
  return { dir: query.slice(0, idx) || ".", name: query.slice(idx + 1) };
}

/** Replaces the trailing `@query` with `@value` plus a trailing space. */
export function applyMention(
  text: string,
  value: string,
  options?: { keepOpen?: boolean }
): string {
  const suffix = options?.keepOpen ? "" : " ";
  return text.replace(/(?:^|\s)@([^\s@]*)$/, (match) => {
    const leading = match.startsWith("@") ? "" : match[0];
    return `${leading}@${value}${suffix}`;
  });
}

/** Extracts unique `@<path>` mention tokens from a message text. */
export function parseMentions(text: string): string[] {
  const matches = text.match(/(?:^|\s)@([^\s@]+)/g) ?? [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of matches) {
    const value = raw.trim().replace(/^@/, "");
    if (!value || seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result;
}

/** Removes a specific `@<path>` mention token from the text. */
export function removeMention(text: string, mention: string): string {
  const escaped = mention.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return text
    .replace(new RegExp(`@${escaped}(?=\\s|$)`, "g"), "")
    .replace(/[ \t]{2,}/g, " ")
    .trimEnd();
}
