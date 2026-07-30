/**
 * Convert common Markdown to Telegram HTML parse_mode.
 * Falls back-friendly: unknown syntax is escaped as plain text.
 */

const FENCE_RE = /```([a-zA-Z0-9_+-]*)\n?([\s\S]*?)```/g;
const INLINE_CODE_RE = /`([^`\n]+)`/g;
const LINK_RE = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;
const BOLD_RE = /\*\*([^*]+)\*\*|__([^_]+)__/g;
const ITALIC_RE = /(?<!\*)\*([^*\n]+)\*(?!\*)|(?<!_)_([^_\n]+)_(?!_)/g;
const STRIKE_RE = /~~([^~]+)~~/g;
const HEADING_RE = /^#{1,6}\s+(.+)$/gm;

export function escapeTelegramHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function formatInlineMarkdown(text: string): string {
  const placeholders: string[] = [];
  const stash = (html: string) => {
    const token = `\u0000T${placeholders.length}\u0000`;
    placeholders.push(html);
    return token;
  };

  let next = text.replace(INLINE_CODE_RE, (_match, code: string) =>
    stash(`<code>${escapeTelegramHtml(code)}</code>`)
  );
  next = next.replace(LINK_RE, (_match, label: string, url: string) =>
    stash(
      `<a href="${escapeTelegramHtml(url)}">${escapeTelegramHtml(label)}</a>`
    )
  );
  next = next.replace(BOLD_RE, (_match, a: string, b: string) =>
    stash(`<b>${escapeTelegramHtml(a ?? b)}</b>`)
  );
  next = next.replace(STRIKE_RE, (_match, body: string) =>
    stash(`<s>${escapeTelegramHtml(body)}</s>`)
  );
  next = next.replace(ITALIC_RE, (_match, a: string, b: string) =>
    stash(`<i>${escapeTelegramHtml(a ?? b)}</i>`)
  );
  next = next.replace(HEADING_RE, (_match, body: string) =>
    stash(`<b>${escapeTelegramHtml(body.trim())}</b>`)
  );

  next = escapeTelegramHtml(next);
  return next.replace(/\u0000T(\d+)\u0000/g, (_match, index: string) => {
    return placeholders[Number(index)] ?? "";
  });
}

export function markdownToTelegramHtml(markdown: string): string {
  const source = markdown.replace(/\r\n/g, "\n").trim();
  if (!source) return "";

  const blocks: string[] = [];
  let lastIndex = 0;
  for (const match of source.matchAll(FENCE_RE)) {
    const index = match.index ?? 0;
    if (index > lastIndex) {
      blocks.push(formatInlineMarkdown(source.slice(lastIndex, index)));
    }
    const language = match[1]?.trim();
    const code = escapeTelegramHtml(match[2] ?? "").replace(/\n$/, "");
    blocks.push(
      language
        ? `<pre><code class="language-${escapeTelegramHtml(language)}">${code}</code></pre>`
        : `<pre>${code}</pre>`
    );
    lastIndex = index + match[0].length;
  }
  if (lastIndex < source.length) {
    blocks.push(formatInlineMarkdown(source.slice(lastIndex)));
  }
  return blocks.join("\n").trim();
}

export function splitTelegramChunks(
  text: string,
  limit = 4_000
): string[] {
  const normalized = text.trim() || "کار انجام شد.";
  if (normalized.length <= limit) return [normalized];

  const chunks: string[] = [];
  let remaining = normalized;
  while (remaining.length > limit) {
    const window = remaining.slice(0, limit);
    const splitAt = Math.max(window.lastIndexOf("\n"), window.lastIndexOf(" "));
    const index = splitAt > limit / 2 ? splitAt : window.length;
    chunks.push(remaining.slice(0, index).trim());
    remaining = remaining.slice(index).trim();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}
