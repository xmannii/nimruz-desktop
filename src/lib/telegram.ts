export const TELEGRAM_CREDENTIAL_ID = "telegram-bot";
export const TELEGRAM_STATUS_CHANNEL = "telegram:status-changed";
export const TELEGRAM_CHAT_CHANNEL = "telegram:chat-changed";

export const TELEGRAM_PROXY_MODES = ["direct", "system", "custom"] as const;
export type TelegramProxyMode = (typeof TELEGRAM_PROXY_MODES)[number];

export type TelegramProxySettings = {
  mode: TelegramProxyMode;
  url: string | null;
};

export const DEFAULT_TELEGRAM_PROXY_SETTINGS: TelegramProxySettings = {
  mode: "direct",
  url: null,
};

export type TelegramSettings = {
  enabled: boolean;
  workspaceId: string;
  pairedUserId: string | null;
  pairedChatId: string | null;
  pairedUsername: string | null;
  botUsername: string | null;
  botName: string | null;
  activeChatId: string | null;
  preferredProviderId: string | null;
  preferredModelId: string | null;
  lastUpdateId: number | null;
  proxy: TelegramProxySettings;
};

export const TELEGRAM_BUTTONS = {
  newChat: "✨ گفت‌وگوی تازه",
  chats: "💬 گفت‌وگوها",
  model: "🧠 مدل",
  status: "📡 وضعیت",
  stop: "⏹ توقف",
  help: "❓ راهنما",
} as const;

export const TELEGRAM_MAIN_KEYBOARD: {
  keyboard: Array<Array<{ text: string }>>;
  resize_keyboard: boolean;
  is_persistent: boolean;
} = {
  keyboard: [
    [
      { text: TELEGRAM_BUTTONS.newChat },
      { text: TELEGRAM_BUTTONS.chats },
    ],
    [
      { text: TELEGRAM_BUTTONS.model },
      { text: TELEGRAM_BUTTONS.status },
    ],
    [
      { text: TELEGRAM_BUTTONS.stop },
      { text: TELEGRAM_BUTTONS.help },
    ],
  ],
  resize_keyboard: true,
  is_persistent: true,
};

export type TelegramConnectionState =
  | "disabled"
  | "disconnected"
  | "connecting"
  | "online"
  | "error";

export type TelegramStatus = {
  settings: TelegramSettings;
  tokenConfigured: boolean;
  tokenHint: string | null;
  secureStorageAvailable: boolean;
  connectionState: TelegramConnectionState;
  error: string | null;
  pairingCode: string | null;
  pairingLink: string | null;
  busy: boolean;
};

export const DEFAULT_TELEGRAM_SETTINGS: TelegramSettings = {
  enabled: false,
  workspaceId: "home",
  pairedUserId: null,
  pairedChatId: null,
  pairedUsername: null,
  botUsername: null,
  botName: null,
  activeChatId: null,
  preferredProviderId: null,
  preferredModelId: null,
  lastUpdateId: null,
  proxy: DEFAULT_TELEGRAM_PROXY_SETTINGS,
};

function optionalText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized ? normalized.slice(0, maxLength) : null;
}

function telegramId(value: unknown): string | null {
  if (typeof value !== "string" || !/^-?\d{1,20}$/.test(value)) return null;
  return value;
}

const TELEGRAM_PROXY_MODE_SET = new Set<string>(TELEGRAM_PROXY_MODES);
const TELEGRAM_PROXY_PROTOCOLS = new Set([
  "http:",
  "https:",
  "socks4:",
  "socks5:",
]);

export function normalizeTelegramProxyUrl(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("آدرس پراکسی تلگرام را وارد کنید.");
  }

  let parsed: URL;
  try {
    parsed = new URL(value.trim());
  } catch {
    throw new Error("آدرس پراکسی تلگرام معتبر نیست.");
  }

  if (!TELEGRAM_PROXY_PROTOCOLS.has(parsed.protocol)) {
    throw new Error(
      "پراکسی تلگرام باید از نوع HTTP، HTTPS، SOCKS4 یا SOCKS5 باشد."
    );
  }
  if (!parsed.hostname) {
    throw new Error("نام میزبان پراکسی تلگرام معتبر نیست.");
  }
  if (parsed.username || parsed.password) {
    throw new Error(
      "برای امنیت، نام کاربری و رمز پراکسی را داخل آدرس وارد نکنید. پراکسی بدون احراز هویت استفاده کنید."
    );
  }
  if ((parsed.pathname && parsed.pathname !== "/") || parsed.search || parsed.hash) {
    throw new Error("آدرس پراکسی فقط باید شامل نوع، میزبان و درگاه باشد.");
  }

  return `${parsed.protocol}//${parsed.host}`;
}

export function normalizeTelegramProxySettings(
  value: unknown
): TelegramProxySettings {
  const settings =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  const mode =
    typeof settings.mode === "string" &&
    TELEGRAM_PROXY_MODE_SET.has(settings.mode)
      ? (settings.mode as TelegramProxyMode)
      : DEFAULT_TELEGRAM_PROXY_SETTINGS.mode;

  return {
    mode,
    url: mode === "custom" ? normalizeTelegramProxyUrl(settings.url) : null,
  };
}

function sanitizeTelegramProxySettings(value: unknown): TelegramProxySettings {
  try {
    return normalizeTelegramProxySettings(value);
  } catch {
    return DEFAULT_TELEGRAM_PROXY_SETTINGS;
  }
}

export function sanitizeTelegramSettings(value: unknown): TelegramSettings {
  const settings =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  const lastUpdateId =
    typeof settings.lastUpdateId === "number" &&
    Number.isSafeInteger(settings.lastUpdateId) &&
    settings.lastUpdateId >= 0
      ? settings.lastUpdateId
      : null;

  return {
    enabled:
      typeof settings.enabled === "boolean"
        ? settings.enabled
        : DEFAULT_TELEGRAM_SETTINGS.enabled,
    workspaceId:
      typeof settings.workspaceId === "string" &&
      /^[\w-]{1,128}$/.test(settings.workspaceId)
        ? settings.workspaceId
        : DEFAULT_TELEGRAM_SETTINGS.workspaceId,
    pairedUserId: telegramId(settings.pairedUserId),
    pairedChatId: telegramId(settings.pairedChatId),
    pairedUsername: optionalText(settings.pairedUsername, 64),
    botUsername: optionalText(settings.botUsername, 64),
    botName: optionalText(settings.botName, 128),
    activeChatId:
      typeof settings.activeChatId === "string" &&
      /^[\w-]{1,128}$/.test(settings.activeChatId)
        ? settings.activeChatId
        : null,
    preferredProviderId:
      typeof settings.preferredProviderId === "string" &&
      /^[\w-]{1,128}$/.test(settings.preferredProviderId)
        ? settings.preferredProviderId
        : null,
    preferredModelId:
      typeof settings.preferredModelId === "string" &&
      settings.preferredModelId.trim().length > 0 &&
      settings.preferredModelId.trim().length <= 256
        ? settings.preferredModelId.trim()
        : null,
    lastUpdateId,
    proxy: sanitizeTelegramProxySettings(settings.proxy),
  };
}

export function normalizeTelegramBotToken(value: unknown): string {
  if (typeof value !== "string") {
    throw new Error("توکن ربات باید متن باشد.");
  }
  const token = value.trim();
  if (!/^\d{6,14}:[A-Za-z0-9_-]{25,128}$/.test(token)) {
    throw new Error("فرمت توکن ربات تلگرام معتبر نیست.");
  }
  return token;
}

export function normalizeTelegramUsername(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const username = value.trim().replace(/^@/, "");
  return /^[A-Za-z0-9_]{5,64}$/.test(username) ? username : null;
}
