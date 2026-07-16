import { z } from "zod";

export const skillTools = {
  load_skill: {
    description:
      "Load the full instructions for an installed skill by name. Call this when the user's task matches a skill description from the Available skills list. Do not invent skill names.",
    inputSchema: z.object({
      name: z
        .string()
        .min(1)
        .describe("Exact skill name from the Available skills list"),
    }),
  },
};
