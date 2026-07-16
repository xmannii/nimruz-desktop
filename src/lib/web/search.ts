import {
  assertPublicHttpUrl,
  WEB_LIMITS,
  WEB_USER_AGENT,
} from "@/lib/web/url-policy";

export type WebSearchResult = {
  title: string;
  url: string;
  snippet: string;
};

export type WebSearchResponse = {
  success: boolean;
  query: string;
  results: WebSearchResult[];
  error?: string;
};

export function parseDuckDuckGoHtml(html: string): WebSearchResult[] {
  const results: WebSearchResult[] = [];
  const blockPattern =
    /<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?(?:class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>|class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/)/gi;

  let match: RegExpExecArray | null;
  while ((match = blockPattern.exec(html)) && results.length < WEB_LIMITS.maxSearchResults) {
    const href = decodeDuckDuckGoRedirect(match[1]);
    const title = stripTags(match[2]);
    const snippet = stripTags(match[3] ?? match[4] ?? "");
    if (!href || !title) continue;

    try {
      assertPublicHttpUrl(href);
    } catch {
      continue;
    }

    results.push({ title, url: href, snippet });
  }

  if (results.length > 0) return results;

  // Fallback: simpler anchor scan
  const linkPattern =
    /<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  while (
    (match = linkPattern.exec(html)) &&
    results.length < WEB_LIMITS.maxSearchResults
  ) {
    const href = decodeDuckDuckGoRedirect(match[1]);
    const title = stripTags(match[2]);
    if (!href || !title) continue;
    try {
      assertPublicHttpUrl(href);
    } catch {
      continue;
    }
    if (results.some((item) => item.url === href)) continue;
    results.push({ title, url: href, snippet: "" });
  }

  return results;
}

export async function webSearch(
  query: string,
  maxResults = 5
): Promise<WebSearchResponse> {
  const trimmed = query.trim();
  if (!trimmed) {
    return { success: false, query: trimmed, results: [], error: "Empty query." };
  }

  const limit = Math.min(
    Math.max(maxResults, 1),
    WEB_LIMITS.maxSearchResults
  );

  try {
    const response = await fetch("https://html.duckduckgo.com/html/", {
      method: "POST",
      redirect: "follow",
      signal: AbortSignal.timeout(WEB_LIMITS.searchTimeoutMs),
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": WEB_USER_AGENT,
        Accept: "text/html",
      },
      body: new URLSearchParams({ q: trimmed, b: "", kl: "wt-wt" }),
    });

    if (!response.ok) {
      return {
        success: false,
        query: trimmed,
        results: [],
        error: `Search HTTP ${response.status}`,
      };
    }

    const html = await response.text();
    const results = parseDuckDuckGoHtml(html).slice(0, limit);

    if (!results.length) {
      return {
        success: false,
        query: trimmed,
        results: [],
        error: "No search results found.",
      };
    }

    return { success: true, query: trimmed, results };
  } catch (error) {
    return {
      success: false,
      query: trimmed,
      results: [],
      error: error instanceof Error ? error.message : "Search failed.",
    };
  }
}

function decodeDuckDuckGoRedirect(href: string): string {
  try {
    const absolute = href.startsWith("http")
      ? href
      : `https://duckduckgo.com${href.startsWith("/") ? href : `/${href}`}`;
    const parsed = new URL(absolute);
    const uddg = parsed.searchParams.get("uddg");
    if (uddg) return decodeURIComponent(uddg);
    if (parsed.hostname.includes("duckduckgo.com")) return "";
    return parsed.toString();
  } catch {
    return "";
  }
}

function stripTags(value: string): string {
  return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}
