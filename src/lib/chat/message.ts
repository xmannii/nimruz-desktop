import type { LanguageModelUsage, UIMessage } from "ai";
import type { FileCategory } from "@/lib/workspace";

/**
 * A file the user attached to a message. Images are additionally sent as file
 * parts (for vision models); documents travel as `@path` references in the text
 * that the agent resolves with its tools. Both are surfaced here so the chat UI
 * can render them as cards above the message text.
 */
export type MessageAttachment = {
  name: string;
  relativePath: string;
  mediaType: string;
  category: FileCategory;
};

export type ChatMessageMetadata = {
  totalUsage?: LanguageModelUsage;
  attachments?: MessageAttachment[];
};

export type ChatUIMessage = UIMessage<ChatMessageMetadata>;
