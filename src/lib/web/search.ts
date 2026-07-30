import { decodeHtmlEntities, htmlToText } from "./html-to-text";
import { assertPublicHttpUrl, WEB_LIMITS, WEB_USER_AGENT } from "./url-policy";

const DUCKDUCKGO_HTML_URL = "https://html.duckduckgo.com/html/";
const MAX_QUERY_LENGTH = 500;

export type SearchResult = {
  title: string;
  url: string;
  snippet?: string;
};

export type WebSearchResult = {
  success: boolean;
  query: string;
  results?: SearchResult[];
  error?: string;
};

type SearchOptions = {
  maxResults?: number;
  fetchImpl?: typeof fetch;
};

/**
 * Search DuckDuckGo's lightweight HTML endpoint. This intentionally has no API
 * key: it is a best-effort discovery tool, not a service-level-guaranteed API.
 */
export async function searchDuckDuckGo(
  query: string,
  options: SearchOptions = {}
): Promise<WebSearchResult> {
  const normalizedQuery = query.trim();
  if (!normalizedQuery) {
    return { success: false, query: normalizedQuery, error: "Search query is required." };
  }
  if (normalizedQuery.length > MAX_QUERY_LENGTH) {
    return {
      success: false,
      query: normalizedQuery,
      error: `Search query exceeds ${MAX_QUERY_LENGTH} characters.`,
    };
  }

  const maxResults = Math.min(Math.max(options.maxResults ?? 5, 1), 10);
  const url = new URL(DUCKDUCKGO_HTML_URL);
  url.searchParams.set("q", normalizedQuery);

  try {
    const response = await (options.fetchImpl ?? fetch)(url, {
      method: "GET",
      signal: AbortSignal.timeout(WEB_LIMITS.fetchTimeoutMs),
      headers: {
        Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5",
        "Accept-Language": "en-US,en;q=0.9,fa;q=0.8",
        "User-Agent": WEB_USER_AGENT,
      },
    });

    if (!response.ok) {
      return {
        success: false,
        query: normalizedQuery,
        error: `Search HTTP ${response.status}`,
      };
    }

    const html = await readLimitedText(response, WEB_LIMITS.maxResponseBytes);
    return {
      success: true,
      query: normalizedQuery,
      results: parseDuckDuckGoResults(html, maxResults),
    };
  } catch (error) {
    return {
      success: false,
      query: normalizedQuery,
      error: error instanceof Error ? error.message : "Search failed.",
    };
  }
}

export function parseDuckDuckGoResults(html: string, maxResults = 5): SearchResult[] {
  const results: SearchResult[] = [];
  const anchors = [...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)]
    .filter((match) => /\bresult__a\b/i.test(match[1]));

  for (let index = 0; index < anchors.length && results.length < maxResults; index += 1) {
    const match = anchors[index];
    const href = getHtmlAttribute(match[1], "href");
    const title = htmlToText(match[2], { maxLength: 500 });
    if (!href || !title) continue;

    const url = unwrapDuckDuckGoUrl(href);
    if (!url) continue;

    const nextAnchor = anchors[index + 1];
    const searchWindow = html.slice(
      (match.index ?? 0) + match[0].length,
      nextAnchor?.index ?? html.length
    );
    const snippet = extractSnippet(searchWindow);
    results.push({ title, url, ...(snippet ? { snippet } : {}) });
  }

  return results;
}

async function readLimitedText(response: Response, maxBytes: number): Promise<string> {
  if (!response.body) {
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.byteLength > maxBytes) throw new Error("Search response exceeds size limit.");
    return buffer.toString("utf8");
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > maxBytes) throw new Error("Search response exceeds size limit.");
    chunks.push(value);
  }
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString("utf8");
}

function getHtmlAttribute(attributes: string, name: string): string | undefined {
  const match = attributes.match(
    new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i")
  );
  const raw = match?.[1] ?? match?.[2] ?? match?.[3];
  return raw ? decodeHtmlEntities(raw) : undefined;
}

function unwrapDuckDuckGoUrl(rawUrl: string): string | undefined {
  try {
    const candidate = new URL(rawUrl, DUCKDUCKGO_HTML_URL);
    const isDuckDuckGoRedirect =
      candidate.hostname.endsWith("duckduckgo.com") && candidate.pathname === "/l/";
    const destination = isDuckDuckGoRedirect
      ? candidate.searchParams.get("uddg")
      : candidate.toString();
    if (!destination) return undefined;
    return assertPublicHttpUrl(destination).toString();
  } catch {
    return undefined;
  }
}

function extractSnippet(html: string): string | undefined {
  const match = html.match(
    /<(?:a|span)\b[^>]*\bclass\s*=\s*(?:"[^"]*\bresult__snippet\b[^"]*"|'[^']*\bresult__snippet\b[^']*')[^>]*>([\s\S]*?)<\/(?:a|span)>/i
  );
  const snippet = match
    ? htmlToText(match[1], { maxLength: 1_000 }).replace(/\s+([,.;:!?])/g, "$1")
    : "";
  return snippet || undefined;
}
