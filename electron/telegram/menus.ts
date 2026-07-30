import { isPickableModel } from "@/lib/models/catalog";
import type { LocalChat } from "@/lib/chat/storage";
import type { AppDatabase } from "../storage/database";
import type { TelegramInlineKeyboard } from "./api";

export const RECENT_CHAT_LIMIT = 8;
export const MODEL_PICKER_LIMIT = 12;

export function listRecentWorkspaceChats(
  database: AppDatabase,
  workspaceId: string,
  limit = RECENT_CHAT_LIMIT
): LocalChat[] {
  return database
    .loadChats()
    .filter((chat) => chat.workspaceId === workspaceId)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, limit);
}

export function listPickableTelegramModels(database: AppDatabase) {
  const providers = database.listProviders();
  const providerNames = new Map(
    providers.map((provider) => [provider.id, provider.name] as const)
  );
  return database
    .listModels()
    .filter((model) => isPickableModel(model, providers))
    .sort((a, b) => {
      const providerA = providerNames.get(a.providerId) ?? a.providerId;
      const providerB = providerNames.get(b.providerId) ?? b.providerId;
      return (
        providerA.localeCompare(providerB, "fa") ||
        a.fullName.localeCompare(b.fullName, "fa")
      );
    })
    .slice(0, MODEL_PICKER_LIMIT)
    .map((model) => ({
      model,
      providerName: providerNames.get(model.providerId) ?? model.providerId,
    }));
}

export function recentChatsKeyboard(
  chats: LocalChat[],
  activeChatId: string | null
): TelegramInlineKeyboard {
  if (chats.length === 0) {
    return {
      inline_keyboard: [[{ text: "💬 گفت‌وگویی نیست", callback_data: "tx" }]],
    };
  }
  return {
    inline_keyboard: chats.map((chat, index) => [
      {
        text: `${chat.id === activeChatId ? "✅ " : "💬 "}${truncateLabel(chat.title || "بدون عنوان", 48)}`,
        callback_data: `tc:${index}`,
      },
    ]),
  };
}

export function modelsKeyboard(
  models: ReturnType<typeof listPickableTelegramModels>,
  active?: { providerId: string; modelId: string } | null
): TelegramInlineKeyboard {
  if (models.length === 0) {
    return {
      inline_keyboard: [
        [{ text: "🧠 مدل فعالی نیست", callback_data: "tx" }],
      ],
    };
  }
  return {
    inline_keyboard: models.map(({ model, providerName }, index) => {
      const selected =
        active?.providerId === model.providerId &&
        active?.modelId === model.modelId;
      return [
        {
          text: `${selected ? "✅ " : "🧠 "}${truncateLabel(`${providerName} · ${model.fullName || model.name}`, 56)}`,
          callback_data: `tm:${index}`,
        },
      ];
    }),
  };
}

function truncateLabel(value: string, max: number) {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > max
    ? `${normalized.slice(0, max - 1)}…`
    : normalized;
}
