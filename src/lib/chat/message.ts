import type { LanguageModelUsage, UIMessage } from "ai";

export type ChatMessageMetadata = {
  totalUsage?: LanguageModelUsage;
};

export type ChatUIMessage = UIMessage<ChatMessageMetadata>;
