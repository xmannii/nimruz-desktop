import type { Expert } from "@/lib/settings/experts";
import { expertDelegationToolName } from "@/lib/settings/experts";
import { generateText, tool, type LanguageModel } from "ai";
import { z } from "zod";

export function expertToolName(expert: Expert) {
  return expertDelegationToolName(expert.slug);
}

export function createExpertTools(experts: Expert[], model: LanguageModel) {
  return Object.fromEntries(
    experts.filter((expert) => expert.enabled).map((expert) => [
      expertToolName(expert),
      tool({
        description: `Delegate to ${expert.name}. ${expert.description} Use this expert whenever the user's request matches this purpose.`,
        inputSchema: z.object({
          task: z
            .string()
            .min(1)
            .max(12_000)
            .describe("Complete task and all relevant context for the expert"),
        }),
        execute: async ({ task }, { abortSignal }) => {
          const result = await generateText({
            model,
            instructions: [
              `You are the ${expert.name} expert.`,
              expert.instructions,
              "Complete only the delegated task. Return a polished final result to the main assistant, with no meta-commentary about delegation.",
            ].join("\n\n"),
            prompt: task,
            abortSignal,
          });
          return result.text;
        },
      }),
    ])
  );
}
