import { EXPERT_LIMITS } from "@/lib/settings/experts";
import { z } from "zod";

export const expertManagementTools = {
  create_expert: {
    description:
      "Create a reusable specialist only when the user explicitly asks to create, save, or configure one. Do not create experts merely to handle the current task.",
    inputSchema: z.object({
      name: z
        .string()
        .min(1)
        .max(EXPERT_LIMITS.name)
        .describe("Short, distinctive user-facing name"),
      slug: z
        .string()
        .min(1)
        .max(EXPERT_LIMITS.slug)
        .describe(
          "Unique lowercase kebab-case command slug, for example linkedin-post"
        ),
      description: z
        .string()
        .min(1)
        .max(EXPERT_LIMITS.description)
        .describe(
          "Clear sentence describing when the main assistant should delegate"
        ),
      instructions: z
        .string()
        .min(1)
        .max(EXPERT_LIMITS.instructions)
        .describe(
          "Detailed role, style, workflow, length, constraints, and output expectations"
        ),
      triggers: z
        .array(z.string().min(1).max(EXPERT_LIMITS.trigger))
        .max(EXPERT_LIMITS.triggers)
        .optional()
        .describe(
          "Small set of distinctive routing phrases; avoid broad generic words"
        ),
    }),
  },
};
