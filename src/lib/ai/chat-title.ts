export const CHAT_TITLE_LIMITS = {
  maxLength: 80,
} as const;

export function normalizeChatTitle(title: string) {
  return title.trim().replace(/\s+/g, " ");
}

export function isValidChatTitle(title: string) {
  const normalized = normalizeChatTitle(title);
  return (
    normalized.length > 0 &&
    normalized.length <= CHAT_TITLE_LIMITS.maxLength
  );
}

export function fallbackTitleFromMessage(message: string) {
  const normalized = normalizeChatTitle(message);
  if (!normalized) return "گفتگوی جدید";
  if (normalized.length <= CHAT_TITLE_LIMITS.maxLength) return normalized;
  return `${normalized.slice(0, CHAT_TITLE_LIMITS.maxLength - 1)}…`;
}
