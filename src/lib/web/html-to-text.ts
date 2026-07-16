const BLOCK_TAGS =
  /<\/?(?:article|aside|blockquote|br|div|footer|h[1-6]|header|hr|li|main|nav|p|section|table|tr|td|th|ul|ol|pre)[^>]*>/gi;

const SKIP_TAGS = /<(?:script|style|noscript|svg|iframe|canvas|video|audio)[^>]*>[\s\S]*?<\/(?:script|style|noscript|svg|iframe|canvas|video|audio)>/gi;

const GENERIC_TAG = /<[^>]+>/g;

const ENTITIES: Record<string, string> = {
  "&nbsp;": " ",
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
};

export type CleanHtmlOptions = {
  maxLength?: number;
};

export function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) =>
      String.fromCharCode(parseInt(hex, 16))
    )
    .replace(/&[a-z]+;/gi, (entity) => ENTITIES[entity.toLowerCase()] ?? entity);
}

export function htmlToText(html: string, options: CleanHtmlOptions = {}): string {
  const maxLength = options.maxLength ?? 32_000;

  let text = html
    .replace(SKIP_TAGS, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(BLOCK_TAGS, "\n")
    .replace(GENERIC_TAG, " ");

  text = decodeHtmlEntities(text);
  text = text
    .replace(/\r\n/g, "\n")
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (text.length > maxLength) {
    text = `${text.slice(0, maxLength)}\n\n[truncated]`;
  }

  return text;
}

export function extractTitle(html: string): string | undefined {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!match) return undefined;
  return decodeHtmlEntities(match[1].replace(GENERIC_TAG, " ").trim()) || undefined;
}
