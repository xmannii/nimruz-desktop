import { fetchPage } from "@/lib/web/fetch-page";
import { webSearch } from "@/lib/web/search";
import { WEB_LIMITS } from "@/lib/web/url-policy";
import { tool } from "ai";
import { z } from "zod";

export const webSearchTool = tool({
  description:
    "Search the public web for current information, documentation, news, or facts. Use when the user asks about recent events, specific websites, or anything not in your training data. Follow up with fetch_url for full page content when needed.",
  inputSchema: z.object({
    query: z.string().min(1).max(300).describe("Search query"),
    maxResults: z
      .number()
      .int()
      .min(1)
      .max(WEB_LIMITS.maxSearchResults)
      .optional()
      .describe("Number of results to return (default 5)"),
  }),
  execute: async ({ query, maxResults }) => webSearch(query, maxResults ?? 5),
});

export const fetchUrlTool = tool({
  description:
    "Fetch a public web page and return cleaned readable text. Use after web_search or when the user provides a URL. Only http/https URLs; private networks are blocked.",
  inputSchema: z.object({
    url: z.string().url().describe("Public http or https URL to fetch"),
  }),
  execute: async ({ url }) => fetchPage(url),
});

export const webTools = {
  web_search: webSearchTool,
  fetch_url: fetchUrlTool,
};
