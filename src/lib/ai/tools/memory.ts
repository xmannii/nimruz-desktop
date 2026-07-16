import { MEMORY_CATEGORIES } from "@/lib/settings/memories";
import { z } from "zod";

export const memoryTools = {
  save_memory: {
    description:
      "Save a durable fact about the user for future conversations. Use for stable preferences, lasting personal context, ongoing goals, or when the user explicitly asks you to remember something. Write one concise third-person fact in the user's language.",
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
      "Delete a previously saved memory by id when it is wrong, outdated, or the user asks to forget it.",
    inputSchema: z.object({
      id: z.string().describe("The id of the memory to delete"),
    }),
  },
};
