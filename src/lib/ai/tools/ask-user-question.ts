import { z } from "zod";

export const askUserQuestionTools = {
  ask_user_question: {
    description:
      "Ask the user one focused multiple-choice question when a missing decision would materially change the plan. Prefer 2–6 clear options. Wait for the answer before finalizing the plan.",
    inputSchema: z.object({
      question: z
        .string()
        .min(1)
        .max(500)
        .describe("The clarifying question shown above the chat input"),
      options: z
        .array(
          z.object({
            id: z
              .string()
              .min(1)
              .max(64)
              .describe("Stable option id returned in the answer"),
            label: z
              .string()
              .min(1)
              .max(200)
              .describe("Short clickable label in the user's language"),
          })
        )
        .min(2)
        .max(6)
        .describe("Clickable answer choices"),
      allowMultiple: z
        .boolean()
        .optional()
        .describe("When true, the user may select more than one option"),
    }),
  },
};
