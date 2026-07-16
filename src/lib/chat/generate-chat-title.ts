import {
  fallbackTitleFromMessage,
  isValidChatTitle,
  normalizeChatTitle,
} from "@/lib/ai/chat-title";

type GenerateChatTitleOptions = {
  message: string;
  providerId: string;
  model: string;
  getSessionToken: () => Promise<string>;
};

export async function generateChatTitle({
  message,
  providerId,
  model,
  getSessionToken,
}: GenerateChatTitleOptions): Promise<string> {
  const trimmed = message.trim().replace(/\s+/g, " ");
  if (!trimmed) return fallbackTitleFromMessage(message);

  try {
    const response = await fetch("/api/chat/title", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${await getSessionToken()}`,
      },
      body: JSON.stringify({
        message: trimmed,
        providerId,
        model,
      }),
    });

    if (!response.ok) {
      return fallbackTitleFromMessage(trimmed);
    }

    const data = (await response.json()) as { title?: unknown };
    if (typeof data.title !== "string") {
      return fallbackTitleFromMessage(trimmed);
    }

    const normalized = normalizeChatTitle(data.title);
    return isValidChatTitle(normalized)
      ? normalized
      : fallbackTitleFromMessage(trimmed);
  } catch {
    return fallbackTitleFromMessage(trimmed);
  }
}

export { fallbackTitleFromMessage };
