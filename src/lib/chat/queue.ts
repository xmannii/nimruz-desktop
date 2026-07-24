export type ChatQueuedMessageKind = "follow_up" | "steer";

export type ChatQueuedMessage = {
  id: string;
  chatId: string;
  text: string;
  kind: ChatQueuedMessageKind;
  createdAt: number;
};

export const CHAT_QUEUE_LIMIT = 20;
export const CHAT_QUEUE_TEXT_LIMIT = 20_000;
