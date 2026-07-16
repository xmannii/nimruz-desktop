import { z } from "zod";

export const skillTools = {
  load_skill: {
    description:
      "Load full instructions for an installed skill by exact name from Available skills. Call when the task matches. Do not invent names.",
    inputSchema: z.object({
      name: z
        .string()
        .min(1)
        .describe("Exact skill name from the Available skills list"),
    }),
  },
};
