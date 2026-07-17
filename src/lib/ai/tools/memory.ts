import { MEMORY_CATEGORIES } from "@/lib/settings/memories";
import { z } from "zod";

export const memoryTools = {
  save_memory: {
    description:
      "Store one durable user fact for future chats only when explicitly requested or clearly useful long-term. Use for stable preferences, lasting context, or ongoing goals—not secrets, transient task state, excerpts, or duplicate memories.",
    inputSchema: z.object({
      content: z
        .string()
        .min(1)
        .max(300)
        .describe(
          "One atomic, concise, third-person fact in the user's language; no secrets or speculation"
        ),
      category: z
        .enum(MEMORY_CATEGORIES)
        .optional()
        .describe("Category: preference, fact, context, or goal"),
    }),
  },
  delete_memory: {
    description:
      "Delete one saved memory only when the user asks to forget it or the identified fact is clearly wrong/outdated. Requires the exact memory id.",
    inputSchema: z.object({
      id: z.string().describe("The id of the memory to delete"),
    }),
  },
};
