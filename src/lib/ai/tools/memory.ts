import { MEMORY_CATEGORIES } from "@/lib/settings/memories";
import { z } from "zod";

export const memoryTools = {
  save_memory: {
    description:
      "Save a durable user fact for future chats. Use for stable preferences, lasting context, ongoing goals, or explicit remember requests. One concise third-person fact in the user's language.",
    inputSchema: z.object({
      content: z
        .string()
        .min(1)
        .max(300)
        .describe("Concise fact to remember"),
      category: z
        .enum(MEMORY_CATEGORIES)
        .optional()
        .describe("Category: preference, fact, context, or goal"),
    }),
  },
  delete_memory: {
    description:
      "Delete a saved memory by id when wrong, outdated, or the user asks to forget it.",
    inputSchema: z.object({
      id: z.string().describe("The id of the memory to delete"),
    }),
  },
};
