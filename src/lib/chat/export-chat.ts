import { messagesToMarkdown } from "@/components/ai-elements/conversation";
import type { LocalChat } from "@/lib/chat/storage";
import { getMessageText } from "@/lib/chat/message-text";
import type { UIMessage } from "ai";

function sanitizeFilename(title: string): string {
  const trimmed = title.trim().replace(/\s+/g, " ").slice(0, 80);
  const safe = trimmed.replace(/[^\w\u0600-\u06FF\s-]+/g, "").trim();
  return safe || "chat";
}

function formatMessageForExport(message: UIMessage): string {
  const roleLabel = message.role === "user" ? "کاربر" : "دستیار";
  return `**${roleLabel}:** ${getMessageText(message)}`;
}

function downloadBlob(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function exportChatMarkdown(chat: LocalChat) {
  const markdown = [
    `# ${chat.title}`,
    "",
    `- مدل: ${chat.model}`,
    `- ایجاد: ${new Date(chat.createdAt).toLocaleString("fa-IR")}`,
    `- آخرین بروزرسانی: ${new Date(chat.updatedAt).toLocaleString("fa-IR")}`,
    "",
    messagesToMarkdown(chat.messages, formatMessageForExport),
  ].join("\n");

  downloadBlob(
    markdown,
    `${sanitizeFilename(chat.title)}.md`,
    "text/markdown;charset=utf-8"
  );
}

export function exportChatJson(chat: LocalChat) {
  const payload = {
    id: chat.id,
    title: chat.title,
    model: chat.model,
    providerId: chat.providerId,
    createdAt: chat.createdAt,
    updatedAt: chat.updatedAt,
    pinned: chat.pinned ?? false,
    messages: chat.messages,
  };

  downloadBlob(
    JSON.stringify(payload, null, 2),
    `${sanitizeFilename(chat.title)}.json`,
    "application/json;charset=utf-8"
  );
}
