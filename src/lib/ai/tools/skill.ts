import { z } from "zod";

export const skillTools = {
  load_skill: {
    description:
      "Load task-specific operating instructions before acting when an exact entry under Available skills clearly matches the request. Do not guess names or load skills speculatively.",
    inputSchema: z.object({
      name: z
        .string()
        .min(1)
        .describe("Exact skill name from the Available skills list"),
    }),
  },
};
