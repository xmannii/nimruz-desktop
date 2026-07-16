import { fetchPage } from "@/lib/web/fetch-page";
import { tool } from "ai";
import { z } from "zod";

export const fetchUrlTool = tool({
  description:
    "Fetch a public http(s) page as cleaned text. Use for shared/known URLs. Private networks blocked.",
  inputSchema: z.object({
    url: z.string().url().describe("Public http or https URL to fetch"),
  }),
  execute: async ({ url }) => fetchPage(url),
});

export const webTools = {
  fetch_url: fetchUrlTool,
};
