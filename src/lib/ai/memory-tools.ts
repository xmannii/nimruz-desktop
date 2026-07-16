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
  create_expert: {
    description:
      "Create a reusable specialist when the user explicitly asks to create, add, or configure an expert/sub-agent. Do not use merely because a task could benefit from an expert.",
    inputSchema: z.object({
      name: z.string().min(1).max(60).describe("Friendly display name"),
      slug: z.string().min(1).max(40).describe("Lowercase command slug, for example linkedin-post"),
      description: z.string().min(1).max(240).describe("Clear sentence describing when the main assistant should delegate"),
      instructions: z.string().min(1).max(8000).describe("Detailed role, style, workflow, length, constraints, and output expectations"),
      triggers: z.array(z.string().min(1).max(80)).max(12).optional().describe("Natural-language phrases associated with this expert"),
    }),
  },
};
