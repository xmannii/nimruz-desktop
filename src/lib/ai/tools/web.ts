import { fetchPage } from "@/lib/web/fetch-page";
import { tool } from "ai";
import { z } from "zod";

export const fetchUrlTool = tool({
  description:
    "Fetch a public web page and return cleaned readable text. Use when the user provides a URL or asks you to read a specific page. Only http/https URLs; private networks are blocked.",
  inputSchema: z.object({
    url: z.string().url().describe("Public http or https URL to fetch"),
  }),
  execute: async ({ url }) => fetchPage(url),
});

export const webTools = {
  fetch_url: fetchUrlTool,
};
