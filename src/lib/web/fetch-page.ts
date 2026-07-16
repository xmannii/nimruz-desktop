import { extractTitle, htmlToText } from "@/lib/web/html-to-text";
import {
  assertPublicHttpUrl,
  WEB_LIMITS,
  WEB_USER_AGENT,
} from "@/lib/web/url-policy";

export type FetchPageResult = {
  success: boolean;
  url: string;
  finalUrl?: string;
  title?: string;
  content?: string;
  contentType?: string;
  error?: string;
};

export async function fetchPage(url: string): Promise<FetchPageResult> {
  const parsed = assertPublicHttpUrl(url);

  try {
    const response = await fetch(parsed.toString(), {
      method: "GET",
      redirect: "follow",
      signal: AbortSignal.timeout(WEB_LIMITS.fetchTimeoutMs),
      headers: {
        Accept:
          "text/html,application/xhtml+xml,text/plain;q=0.9,application/json;q=0.8,*/*;q=0.5",
        "Accept-Language": "en-US,en;q=0.9,fa;q=0.8",
        "User-Agent": WEB_USER_AGENT,
      },
    });

    if (!response.ok) {
      return {
        success: false,
        url: parsed.toString(),
        error: `HTTP ${response.status} ${response.statusText}`,
      };
    }

    const contentType = response.headers.get("content-type") ?? undefined;
    const buffer = await readLimitedBody(response, WEB_LIMITS.maxResponseBytes);
    const raw = buffer.toString("utf-8");

    const isHtml = contentType?.includes("html") || looksLikeHtml(raw);
    const title = isHtml ? extractTitle(raw) : undefined;
    const content = isHtml
      ? htmlToText(raw, { maxLength: WEB_LIMITS.maxCleanChars })
      : raw.trim().slice(0, WEB_LIMITS.maxCleanChars);

    if (!content) {
      return {
        success: false,
        url: parsed.toString(),
        finalUrl: response.url,
        contentType,
        error: "No readable content extracted.",
      };
    }

    return {
      success: true,
      url: parsed.toString(),
      finalUrl: response.url,
      title,
      content,
      contentType,
    };
  } catch (error) {
    return {
      success: false,
      url: parsed.toString(),
      error: error instanceof Error ? error.message : "Fetch failed.",
    };
  }
}

async function readLimitedBody(
  response: Response,
  maxBytes: number
): Promise<Buffer> {
  if (!response.body) {
    const arrayBuffer = await response.arrayBuffer();
    if (arrayBuffer.byteLength > maxBytes) {
      throw new Error(`Response exceeds ${maxBytes} bytes.`);
    }
    return Buffer.from(arrayBuffer);
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > maxBytes) {
      throw new Error(`Response exceeds ${maxBytes} bytes.`);
    }
    chunks.push(value);
  }

  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
}

function looksLikeHtml(text: string): boolean {
  return /<\s*(?:!doctype|html|head|body|div|p|article|main)\b/i.test(text);
}
