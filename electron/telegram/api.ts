export type TelegramUser = {
  id: number;
  is_bot: boolean;
  first_name: string;
  last_name?: string;
  username?: string;
};

export type TelegramChat = {
  id: number;
  type: "private" | "group" | "supergroup" | "channel";
};

export type TelegramMessage = {
  message_id: number;
  from?: TelegramUser;
  chat: TelegramChat;
  text?: string;
  voice?: {
    file_id: string;
    file_unique_id: string;
    duration: number;
    mime_type?: string;
    file_size?: number;
  };
};

export type TelegramCallbackQuery = {
  id: string;
  from: TelegramUser;
  message?: TelegramMessage;
  data?: string;
};

export type TelegramUpdate = {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
};

export type TelegramFile = {
  file_id: string;
  file_unique_id: string;
  file_size?: number;
  file_path?: string;
};

type TelegramEnvelope<T> = {
  ok: boolean;
  result?: T;
  description?: string;
};

export type TelegramInlineKeyboard = {
  inline_keyboard: Array<
    Array<{
      text: string;
      callback_data: string;
    }>
  >;
};

export type TelegramReplyKeyboard = {
  keyboard: Array<Array<{ text: string }>>;
  resize_keyboard?: boolean;
  is_persistent?: boolean;
  one_time_keyboard?: boolean;
};

export type TelegramReplyMarkup =
  | TelegramInlineKeyboard
  | TelegramReplyKeyboard
  | { remove_keyboard: true };

export type TelegramSendMessageOptions = {
  replyMarkup?: TelegramReplyMarkup;
  parseMode?: "HTML" | "MarkdownV2";
  signal?: AbortSignal;
};

export class TelegramApi {
  constructor(
    private readonly token: string,
    private readonly fetchImpl: typeof fetch = globalThis.fetch
  ) {}

  private async call<T>(
    method: string,
    body: Record<string, unknown> = {},
    signal?: AbortSignal
  ): Promise<T> {
    const response = await this.fetchImpl(
      `https://api.telegram.org/bot${this.token}/${method}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal,
      }
    );
    let payload: TelegramEnvelope<T>;
    try {
      payload = (await response.json()) as TelegramEnvelope<T>;
    } catch {
      throw new Error(`Telegram returned HTTP ${response.status}.`);
    }
    if (!response.ok || !payload.ok || payload.result === undefined) {
      throw new Error(
        payload.description || `Telegram returned HTTP ${response.status}.`
      );
    }
    return payload.result;
  }

  getMe(signal?: AbortSignal) {
    return this.call<TelegramUser>("getMe", {}, signal);
  }

  deleteWebhook(signal?: AbortSignal) {
    return this.call<boolean>("deleteWebhook", {}, signal);
  }

  getUpdates(
    options: { offset?: number; timeout?: number },
    signal?: AbortSignal
  ) {
    return this.call<TelegramUpdate[]>(
      "getUpdates",
      {
        ...options,
        allowed_updates: ["message", "callback_query"],
      },
      signal
    );
  }

  getFile(fileId: string, signal?: AbortSignal) {
    return this.call<TelegramFile>("getFile", { file_id: fileId }, signal);
  }

  async downloadFile(fileId: string, signal?: AbortSignal) {
    const file = await this.getFile(fileId, signal);
    if (!file.file_path) throw new Error("Telegram did not return a file path.");
    const response = await this.fetchImpl(
      `https://api.telegram.org/file/bot${this.token}/${file.file_path}`,
      { signal }
    );
    if (!response.ok) {
      throw new Error(`Telegram file download returned HTTP ${response.status}.`);
    }
    return new Uint8Array(await response.arrayBuffer());
  }

  sendMessage(
    chatId: string,
    text: string,
    options: TelegramSendMessageOptions = {}
  ) {
    return this.call<TelegramMessage>(
      "sendMessage",
      {
        chat_id: chatId,
        text,
        ...(options.parseMode ? { parse_mode: options.parseMode } : {}),
        ...(options.replyMarkup ? { reply_markup: options.replyMarkup } : {}),
      },
      options.signal
    );
  }

  answerCallbackQuery(
    callbackQueryId: string,
    text?: string,
    signal?: AbortSignal
  ) {
    return this.call<boolean>(
      "answerCallbackQuery",
      {
        callback_query_id: callbackQueryId,
        ...(text ? { text } : {}),
      },
      signal
    );
  }

  editMessageReplyMarkup(
    chatId: string,
    messageId: number,
    replyMarkup: TelegramInlineKeyboard = { inline_keyboard: [] },
    signal?: AbortSignal
  ) {
    return this.call<TelegramMessage | boolean>(
      "editMessageReplyMarkup",
      {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: replyMarkup,
      },
      signal
    );
  }
}
