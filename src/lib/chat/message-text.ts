import type { UIMessage } from "ai";

export function getMessageText(message: UIMessage): string {
  return message.parts
    .filter((part): part is Extract<(typeof message.parts)[number], { type: "text" }> => part.type === "text")
    .map((part) => part.text)
    .join("\n\n")
    .trim();
}

export function getAssistantCopyText(message: UIMessage): string {
  const text = getMessageText(message);
  if (text) return text;

  const reasoning = message.parts
    .filter((part): part is Extract<(typeof message.parts)[number], { type: "reasoning" }> => part.type === "reasoning")
    .map((part) => part.text)
    .filter(Boolean)
    .join("\n\n")
    .trim();

  return reasoning;
}
