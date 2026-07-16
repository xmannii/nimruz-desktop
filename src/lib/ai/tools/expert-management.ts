import { EXPERT_LIMITS } from "@/lib/settings/experts";
import { z } from "zod";

export const expertManagementTools = {
  create_expert: {
    description:
      "Create a specialist only when the user explicitly asks to create/add/configure an expert. Do not invent experts unprompted.",
    inputSchema: z.object({
      name: z
        .string()
        .min(1)
        .max(EXPERT_LIMITS.name)
        .describe("Friendly display name"),
      slug: z
        .string()
        .min(1)
        .max(EXPERT_LIMITS.slug)
        .describe("Lowercase command slug, for example linkedin-post"),
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
        .describe("Natural-language phrases associated with this expert"),
    }),
  },
};
