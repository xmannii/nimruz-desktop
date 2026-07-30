import { randomBytes } from "node:crypto";
import { nanoid } from "nanoid";
import { OggOpusDecoder } from "ogg-opus-decoder";
import {
  parseJsonEventStream,
  readUIMessageStream,
  uiMessageChunkSchema,
  type UIMessageChunk,
} from "ai";
import type { ChatUIMessage } from "@/lib/chat/message";
import type { LocalChat } from "@/lib/chat/storage";
import { getChatErrorMessage } from "@/lib/chat/errors";
import {
  resamplePcm,
  SHENAVA_SAMPLE_RATE,
} from "@/lib/speech/shenava";
import {
  TELEGRAM_BUTTONS,
  TELEGRAM_CHAT_CHANNEL,
  TELEGRAM_CREDENTIAL_ID,
  TELEGRAM_MAIN_KEYBOARD,
  TELEGRAM_STATUS_CHANNEL,
  normalizeTelegramBotToken,
  type TelegramSettings,
  type TelegramStatus,
} from "@/lib/telegram";
import {
  markdownToTelegramHtml,
  splitTelegramChunks,
} from "@/lib/telegram-format";
import type { AppDatabase } from "../storage/database";
import type { CredentialService } from "../credentials";
import type { ShenavaService } from "../shenava/service";
import type {
  AgentRequestBody,
  AgentRuntimeDeps,
} from "../agent/runtime";
import {
  TelegramApi,
  type TelegramCallbackQuery,
  type TelegramMessage,
  type TelegramReplyMarkup,
  type TelegramUpdate,
} from "./api";
import {
  listPickableTelegramModels,
  listRecentWorkspaceChats,
  modelsKeyboard,
  recentChatsKeyboard,
} from "./menus";

export { TELEGRAM_CHAT_CHANNEL, TELEGRAM_STATUS_CHANNEL };

const MAX_PROMPT_LENGTH = 12_000;
const HELP_TEXT =
  "پیام متنی یا صوتی بفرستید تا نیمروز آن را روی این کامپیوتر اجرا کند.\nپیام صوتی با مدل محلی شنوا رونویسی می‌شود.\n\nاز دکمه‌های پایین می‌توانید گفت‌وگوی تازه بسازید، گفت‌وگوهای اخیر را باز کنید، مدل را عوض کنید یا کار جاری را متوقف کنید.";

type ManualApprovalPart = {
  type: string;
  state: "approval-requested" | "approval-responded";
  toolCallId: string;
  input?: unknown;
  approval: {
    id: string;
    approved?: boolean;
    reason?: string;
    isAutomatic?: boolean;
  };
};

type TelegramServiceOptions = {
  database: AppDatabase;
  credentials: CredentialService;
  agentDeps: AgentRuntimeDeps;
  runAgent: (
    body: AgentRequestBody,
    deps: AgentRuntimeDeps,
    abortSignal?: AbortSignal
  ) => Promise<Response>;
  shenava: ShenavaService;
  fetchImpl?: typeof fetch;
  onStatusChange?: (status: TelegramStatus) => void;
  onChatChange?: (chat: LocalChat) => void;
};

type JsonParseResult<T> =
  | { success: true; value: T }
  | { success: false; error: Error };

function delay(milliseconds: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason);
      return;
    }
    const timeout = setTimeout(resolve, milliseconds);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timeout);
        reject(signal.reason);
      },
      { once: true }
    );
  });
}

function displayName(message: TelegramMessage) {
  const user = message.from;
  if (!user) return null;
  return user.username
    ? `@${user.username}`
    : [user.first_name, user.last_name].filter(Boolean).join(" ").slice(0, 128);
}

function textFromMessage(message: ChatUIMessage | undefined) {
  if (!message) return "";
  return message.parts
    .filter(
      (part): part is Extract<typeof part, { type: "text" }> =>
        part.type === "text"
    )
    .map((part) => part.text)
    .join("")
    .trim();
}

function findManualApproval(
  message: ChatUIMessage | undefined
): ManualApprovalPart | null {
  if (!message) return null;
  for (const part of message.parts) {
    if (
      part.type.startsWith("tool-") &&
      "state" in part &&
      part.state === "approval-requested" &&
      "approval" in part
    ) {
      const approval = (
        part as unknown as { approval?: ManualApprovalPart["approval"] }
      ).approval;
      if (approval && !approval.isAutomatic) {
        return part as unknown as ManualApprovalPart;
      }
    }
  }
  return null;
}

function approvalSummary(part: ManualApprovalPart) {
  const toolName = part.type.replace(/^tool-/, "");
  let subject = "";
  if (part.input && typeof part.input === "object") {
    const input = part.input as Record<string, unknown>;
    const candidate =
      input.command ?? input.path ?? input.from ?? input.url ?? input.query;
    if (typeof candidate === "string") subject = candidate.trim();
  }
  if (!subject) {
    try {
      subject = JSON.stringify(part.input ?? {});
    } catch {
      subject = "";
    }
  }
  const preview =
    subject.length > 500 ? `${subject.slice(0, 500)}…` : subject || "بدون جزئیات";
  return `نیمروز برای ادامه به تأیید شما نیاز دارد.\n\nابزار: ${toolName}\n${preview}`;
}

function cloneAssistantMessage(message: ChatUIMessage): ChatUIMessage {
  return structuredClone(message);
}

/** Resume from the last assistant message when continuing after tool approvals. */
export async function readAgentResponse(
  response: Response,
  previousAssistant?: ChatUIMessage
) {
  if (!response.ok) {
    let message = `Agent returned HTTP ${response.status}.`;
    try {
      const payload = (await response.json()) as { error?: unknown };
      if (typeof payload.error === "string") message = payload.error;
    } catch {
      // Keep the HTTP fallback.
    }
    throw new Error(message);
  }
  if (!response.body) throw new Error("Agent response was empty.");

  const chunks = parseJsonEventStream({
    stream: response.body,
    schema: uiMessageChunkSchema,
  }).pipeThrough(
    new TransformStream<JsonParseResult<UIMessageChunk>, UIMessageChunk>({
      transform(chunk, controller) {
        if (!chunk.success) throw chunk.error;
        controller.enqueue(chunk.value);
      },
    })
  );

  let message: ChatUIMessage | undefined;
  for await (const next of readUIMessageStream<ChatUIMessage>({
    stream: chunks,
    message: previousAssistant
      ? cloneAssistantMessage(previousAssistant)
      : undefined,
    terminateOnError: true,
  })) {
    message = next;
  }
  return message;
}

export function replaceOrAppendAssistant(
  messages: ChatUIMessage[],
  assistant: ChatUIMessage,
  resumedFromAssistant: boolean
) {
  if (resumedFromAssistant && messages.at(-1)?.role === "assistant") {
    return [...messages.slice(0, -1), assistant];
  }
  return [...messages, assistant];
}

export class TelegramService {
  readonly #database: AppDatabase;
  readonly #credentials: CredentialService;
  readonly #agentDeps: AgentRuntimeDeps;
  readonly #runAgent: TelegramServiceOptions["runAgent"];
  readonly #shenava: ShenavaService;
  readonly #fetchImpl: typeof fetch;
  readonly #onStatusChange?: (status: TelegramStatus) => void;
  readonly #onChatChange?: (chat: LocalChat) => void;

  #connectionState: TelegramStatus["connectionState"] = "disconnected";
  #error: string | null = null;
  #pairingCode: string | null = null;
  #pollAbort: AbortController | null = null;
  #agentAbort: AbortController | null = null;
  #pollGeneration = 0;
  #busy = false;

  constructor(options: TelegramServiceOptions) {
    this.#database = options.database;
    this.#credentials = options.credentials;
    this.#agentDeps = options.agentDeps;
    this.#runAgent = options.runAgent;
    this.#shenava = options.shenava;
    this.#fetchImpl = options.fetchImpl ?? globalThis.fetch;
    this.#onStatusChange = options.onStatusChange;
    this.#onChatChange = options.onChatChange;
  }

  initialize() {
    const settings = this.#database.loadTelegramSettings();
    try {
      if (settings.enabled && this.#credentials.getKey(TELEGRAM_CREDENTIAL_ID)) {
        this.startPolling();
      } else {
        this.#connectionState = settings.enabled ? "disconnected" : "disabled";
        this.emitStatus();
      }
    } catch (error) {
      this.#connectionState = "error";
      this.#error = getChatErrorMessage(error);
      this.emitStatus();
    }
  }

  getStatus(): TelegramStatus {
    const credential = this.#credentials.getStatus(TELEGRAM_CREDENTIAL_ID);
    const settings = this.#database.loadTelegramSettings();
    const pairingLink =
      this.#pairingCode && settings.botUsername
        ? `https://t.me/${settings.botUsername}?start=${this.#pairingCode}`
        : null;
    return {
      settings,
      tokenConfigured: credential.configured,
      tokenHint: credential.hint,
      secureStorageAvailable: credential.secure,
      connectionState: settings.enabled
        ? this.#connectionState
        : "disabled",
      error: this.#error,
      pairingCode: this.#pairingCode,
      pairingLink,
      busy: this.#busy,
    };
  }

  async configure(tokenValue: unknown, workspaceId: string) {
    const token = normalizeTelegramBotToken(tokenValue);
    if (!this.#database.getWorkspace(workspaceId)) {
      throw new Error("فضای کاری انتخاب‌شده پیدا نشد.");
    }
    const api = new TelegramApi(token, this.#fetchImpl);
    const bot = await api.getMe(AbortSignal.timeout(15_000));
    if (!bot.is_bot || !bot.username) {
      throw new Error("این توکن به یک ربات معتبر تلگرام تعلق ندارد.");
    }
    await api.deleteWebhook(AbortSignal.timeout(15_000));
    this.#credentials.setKey(TELEGRAM_CREDENTIAL_ID, token);
    this.#pairingCode = randomBytes(18).toString("base64url");
    this.#database.saveTelegramSettings({
      ...this.#database.loadTelegramSettings(),
      enabled: true,
      workspaceId,
      botUsername: bot.username,
      botName: bot.first_name,
      pairedUserId: null,
      pairedChatId: null,
      pairedUsername: null,
      activeChatId: null,
      lastUpdateId: null,
    });
    this.#error = null;
    this.startPolling();
    return this.getStatus();
  }

  setEnabled(enabled: boolean) {
    const settings = this.#database.loadTelegramSettings();
    if (enabled && !this.#credentials.getKey(TELEGRAM_CREDENTIAL_ID)) {
      throw new Error("ابتدا توکن ربات را وارد کنید.");
    }
    this.#database.saveTelegramSettings({ ...settings, enabled });
    if (enabled) this.startPolling();
    else this.stopPolling();
    this.emitStatus();
    return this.getStatus();
  }

  setWorkspace(workspaceId: string) {
    if (!this.#database.getWorkspace(workspaceId)) {
      throw new Error("فضای کاری انتخاب‌شده پیدا نشد.");
    }
    const settings = this.#database.loadTelegramSettings();
    this.#database.saveTelegramSettings({
      ...settings,
      workspaceId,
      activeChatId:
        settings.workspaceId === workspaceId ? settings.activeChatId : null,
    });
    this.emitStatus();
    return this.getStatus();
  }

  beginPairing() {
    const settings = this.#database.loadTelegramSettings();
    if (!this.#credentials.getKey(TELEGRAM_CREDENTIAL_ID)) {
      throw new Error("ابتدا توکن ربات را وارد کنید.");
    }
    if (!settings.botUsername) {
      throw new Error("نام کاربری ربات در دسترس نیست؛ توکن را دوباره ذخیره کنید.");
    }
    this.#pairingCode = randomBytes(18).toString("base64url");
    this.emitStatus();
    return this.getStatus();
  }

  unpair() {
    const settings = this.#database.loadTelegramSettings();
    this.#database.saveTelegramSettings({
      ...settings,
      pairedUserId: null,
      pairedChatId: null,
      pairedUsername: null,
      activeChatId: null,
    });
    this.#pairingCode = randomBytes(18).toString("base64url");
    this.emitStatus();
    return this.getStatus();
  }

  clearToken() {
    this.stopPolling();
    this.#credentials.clearKey(TELEGRAM_CREDENTIAL_ID);
    this.#pairingCode = null;
    this.#error = null;
    this.#database.saveTelegramSettings({
      ...this.#database.loadTelegramSettings(),
      enabled: false,
      pairedUserId: null,
      pairedChatId: null,
      pairedUsername: null,
      botUsername: null,
      botName: null,
      activeChatId: null,
      lastUpdateId: null,
    });
    this.emitStatus();
    return this.getStatus();
  }

  dispose() {
    this.stopPolling();
    this.#agentAbort?.abort();
    this.#agentAbort = null;
  }

  private emitStatus() {
    this.#onStatusChange?.(this.getStatus());
  }

  private emitChat(chat: LocalChat) {
    this.#onChatChange?.(chat);
  }

  private startPolling() {
    this.stopPolling();
    const token = this.#credentials.getKey(TELEGRAM_CREDENTIAL_ID);
    const settings = this.#database.loadTelegramSettings();
    if (!token || !settings.enabled) {
      this.#connectionState = settings.enabled ? "disconnected" : "disabled";
      this.emitStatus();
      return;
    }

    const generation = ++this.#pollGeneration;
    const abort = new AbortController();
    this.#pollAbort = abort;
    this.#connectionState = "connecting";
    this.#error = null;
    this.emitStatus();
    void this.pollLoop(new TelegramApi(token, this.#fetchImpl), generation, abort)
      .catch(() => undefined)
      .finally(() => {
        if (generation === this.#pollGeneration && this.#pollAbort === abort) {
          this.#pollAbort = null;
        }
      });
  }

  private stopPolling() {
    this.#pollGeneration += 1;
    this.#pollAbort?.abort();
    this.#pollAbort = null;
    if (!this.#database.loadTelegramSettings().enabled) {
      this.#connectionState = "disabled";
    } else {
      this.#connectionState = "disconnected";
    }
  }

  private async pollLoop(
    api: TelegramApi,
    generation: number,
    abort: AbortController
  ) {
    while (!abort.signal.aborted && generation === this.#pollGeneration) {
      const settings = this.#database.loadTelegramSettings();
      try {
        const updates = await api.getUpdates(
          {
            offset:
              settings.lastUpdateId == null
                ? undefined
                : settings.lastUpdateId + 1,
            timeout: 25,
          },
          abort.signal
        );
        if (abort.signal.aborted) return;
        this.#connectionState = "online";
        this.#error = null;
        this.emitStatus();
        for (const update of updates) {
          this.#database.saveTelegramSettings({
            ...this.#database.loadTelegramSettings(),
            lastUpdateId: update.update_id,
          });
          await this.handleUpdate(api, update);
        }
      } catch (error) {
        if (abort.signal.aborted) return;
        this.#connectionState = "error";
        this.#error = getChatErrorMessage(error);
        this.emitStatus();
        try {
          await delay(2_500, abort.signal);
        } catch {
          return;
        }
      }
    }
  }

  private async handleUpdate(api: TelegramApi, update: TelegramUpdate) {
    if (update.callback_query) {
      await this.handleCallback(api, update.callback_query);
      return;
    }
    if (update.message) await this.handleMessage(api, update.message);
  }

  private async handleMessage(api: TelegramApi, message: TelegramMessage) {
    if (
      message.chat.type !== "private" ||
      !message.from ||
      message.from.is_bot ||
      (typeof message.text !== "string" && !message.voice)
    ) {
      return;
    }

    const text = message.text?.trim() ?? "";
    const settings = this.#database.loadTelegramSettings();
    const pairMatch = text.match(/^\/start(?:@\w+)?\s+([A-Za-z0-9_-]+)$/);
    if (
      this.#pairingCode &&
      pairMatch?.[1] === this.#pairingCode &&
      !settings.pairedUserId
    ) {
      this.#database.saveTelegramSettings({
        ...settings,
        pairedUserId: String(message.from.id),
        pairedChatId: String(message.chat.id),
        pairedUsername: displayName(message),
      });
      this.#pairingCode = null;
      this.emitStatus();
      await api.sendMessage(
        String(message.chat.id),
        `نیمروز به این حساب متصل شد.\n\n${HELP_TEXT}`,
        {
          replyMarkup: TELEGRAM_MAIN_KEYBOARD,
        }
      );
      return;
    }

    if (
      String(message.from.id) !== settings.pairedUserId ||
      String(message.chat.id) !== settings.pairedChatId
    ) {
      return;
    }

    if (message.voice) {
      await this.handleVoice(api, message);
      return;
    }

    if (
      /^\/start(?:@\w+)?$/.test(text) ||
      text === "/help" ||
      text === TELEGRAM_BUTTONS.help
    ) {
      await api.sendMessage(settings.pairedChatId, HELP_TEXT, {
        replyMarkup: TELEGRAM_MAIN_KEYBOARD,
      });
      return;
    }
    if (text === "/new" || text === TELEGRAM_BUTTONS.newChat) {
      await this.startNewChat(api, settings);
      return;
    }
    if (text === "/chats" || text === TELEGRAM_BUTTONS.chats) {
      await this.showRecentChats(api, settings);
      return;
    }
    if (text === "/model" || text === TELEGRAM_BUTTONS.model) {
      await this.showModelPicker(api, settings);
      return;
    }
    if (text === "/status" || text === TELEGRAM_BUTTONS.status) {
      await this.sendStatus(api, settings);
      return;
    }
    if (text === "/stop" || text === TELEGRAM_BUTTONS.stop) {
      if (!this.#agentAbort) {
        await api.sendMessage(settings.pairedChatId, "کاری در حال اجرا نیست.");
        return;
      }
      this.#agentAbort.abort();
      await api.sendMessage(settings.pairedChatId, "درخواست توقف ارسال شد.");
      return;
    }
    if (text.startsWith("/")) {
      await api.sendMessage(
        settings.pairedChatId,
        "این دستور را نمی‌شناسم. دکمه «❓ راهنما» را بزنید یا /help بفرستید."
      );
      return;
    }
    if (!text || text.length > MAX_PROMPT_LENGTH) {
      await api.sendMessage(
        settings.pairedChatId,
        `پیام باید بین ۱ تا ${MAX_PROMPT_LENGTH.toLocaleString("fa-IR")} نویسه باشد.`
      );
      return;
    }
    if (this.#busy) {
      await api.sendMessage(
        settings.pairedChatId,
        "یک کار دیگر هنوز در حال اجراست. با «📡 وضعیت» وضعیت آن را ببینید یا با «⏹ توقف» متوقفش کنید."
      );
      return;
    }

    await api.sendMessage(settings.pairedChatId, "در حال انجام…");
    await this.runUserPrompt(api, text);
  }

  private async handleVoice(api: TelegramApi, message: TelegramMessage) {
    const settings = this.#database.loadTelegramSettings();
    if (!settings.pairedChatId) return;
    if (this.#busy) {
      await api.sendMessage(
        settings.pairedChatId,
        "یک کار دیگر هنوز در حال اجراست. پس از پایان آن دوباره پیام صوتی را بفرستید."
      );
      return;
    }
    if (!message.voice) return;
    if (message.voice.duration > 180) {
      await api.sendMessage(
        settings.pairedChatId,
        "پیام صوتی باید حداکثر ۳ دقیقه باشد."
      );
      return;
    }
    if ((message.voice.file_size ?? 0) > 20 * 1024 * 1024) {
      await api.sendMessage(
        settings.pairedChatId,
        "حجم این پیام صوتی برای دریافت از تلگرام بیش از حد زیاد است."
      );
      return;
    }

    const shenavaStatus = await this.#shenava.getStatus();
    if (!shenavaStatus.models[shenavaStatus.activeModelKey].installed) {
      await api.sendMessage(
        settings.pairedChatId,
        "برای پیام صوتی، ابتدا یکی از مدل‌های شنوا را در نیمروز از تنظیمات ← گفتار دانلود کنید."
      );
      return;
    }

    this.#busy = true;
    this.emitStatus();
    await api.sendMessage(
      settings.pairedChatId,
      "در حال رونویسی محلی با شنوا…"
    );
    try {
      const encoded = await api.downloadFile(
        message.voice.file_id,
        AbortSignal.timeout(30_000)
      );
      const decoder = new OggOpusDecoder();
      let decoded;
      try {
        decoded = await decoder.decodeFile(encoded);
      } finally {
        decoder.free();
      }
      const channel = decoded.channelData[0];
      if (!channel) throw new Error("صدای قابل‌پردازشی در پیام پیدا نشد.");
      const samples = resamplePcm(
        channel,
        decoded.sampleRate,
        SHENAVA_SAMPLE_RATE
      );
      const transcription = await this.#shenava.transcribe(samples);
      const transcript = transcription.text.trim();
      if (!transcript) {
        throw new Error("گفتار قابل‌تشخیصی در پیام شنیده نشد.");
      }
      await this.sendText(
        api,
        settings.pairedChatId,
        `شنیدم:\n${transcript}`
      );
      await this.runUserPrompt(api, transcript);
    } catch (error) {
      await this.sendText(
        api,
        settings.pairedChatId,
        `رونویسی پیام صوتی ناموفق بود: ${getChatErrorMessage(error)}`
      );
    } finally {
      if (!this.#agentAbort) {
        this.#busy = false;
        this.emitStatus();
      }
    }
  }

  private async handleCallback(
    api: TelegramApi,
    callback: TelegramCallbackQuery
  ) {
    const settings = this.#database.loadTelegramSettings();
    const callbackChatId = callback.message?.chat.id;
    if (
      String(callback.from.id) !== settings.pairedUserId ||
      callbackChatId == null ||
      String(callbackChatId) !== settings.pairedChatId
    ) {
      await api.answerCallbackQuery(callback.id, "این دکمه برای شما نیست.");
      return;
    }

    const data = callback.data ?? "";
    if (data === "tx") {
      await api.answerCallbackQuery(callback.id);
      return;
    }

    const chatMatch = data.match(/^tc:(\d+)$/);
    if (chatMatch) {
      const chats = listRecentWorkspaceChats(
        this.#database,
        settings.workspaceId
      );
      const chat = chats[Number(chatMatch[1])];
      if (!chat) {
        await api.answerCallbackQuery(callback.id, "این گفت‌وگو دیگر در فهرست نیست.");
        return;
      }
      this.#database.saveTelegramSettings({
        ...settings,
        activeChatId: chat.id,
        preferredProviderId: chat.providerId,
        preferredModelId: chat.model,
      });
      this.emitStatus();
      await api.answerCallbackQuery(callback.id, "گفت‌وگو باز شد");
      if (callback.message) {
        await api
          .editMessageReplyMarkup(
            String(callback.message.chat.id),
            callback.message.message_id
          )
          .catch(() => undefined);
      }
      await this.sendText(
        api,
        settings.pairedChatId,
        `گفت‌وگوی «${chat.title}» فعال شد.\nمدل: ${chat.providerId} · ${chat.model}`
      );
      return;
    }

    const modelMatch = data.match(/^tm:(\d+)$/);
    if (modelMatch) {
      const models = listPickableTelegramModels(this.#database);
      const selected = models[Number(modelMatch[1])];
      if (!selected) {
        await api.answerCallbackQuery(callback.id, "این مدل دیگر در فهرست نیست.");
        return;
      }
      const nextSettings = {
        ...settings,
        preferredProviderId: selected.model.providerId,
        preferredModelId: selected.model.modelId,
      };
      if (settings.activeChatId) {
        const chat = this.#database
          .loadChats()
          .find((item) => item.id === settings.activeChatId);
        if (chat) {
          chat.providerId = selected.model.providerId;
          chat.model = selected.model.modelId;
          chat.updatedAt = Date.now();
          this.#database.saveChats([chat]);
          this.emitChat(chat);
        }
      }
      this.#database.saveTelegramSettings(nextSettings);
      this.emitStatus();
      await api.answerCallbackQuery(callback.id, "مدل عوض شد");
      if (callback.message) {
        await api
          .editMessageReplyMarkup(
            String(callback.message.chat.id),
            callback.message.message_id
          )
          .catch(() => undefined);
      }
      await this.sendText(
        api,
        settings.pairedChatId,
        `مدل فعال: **${selected.providerName}** · **${selected.model.fullName || selected.model.name}**`,
        { html: true }
      );
      return;
    }

    const match = data.match(/^t([ad]):(.{1,56})$/);
    if (!match) {
      await api.answerCallbackQuery(callback.id, "درخواست نامعتبر است.");
      return;
    }
    if (this.#busy) {
      await api.answerCallbackQuery(callback.id, "هنوز در حال اجراست.");
      return;
    }
    const approved = match[1] === "a";
    const approvalId = match[2];
    const chat = settings.activeChatId
      ? this.#database.loadChats().find((item) => item.id === settings.activeChatId)
      : null;
    if (!chat || !this.respondToApproval(chat, approvalId, approved)) {
      await api.answerCallbackQuery(callback.id, "این تأیید دیگر فعال نیست.");
      return;
    }

    await api.answerCallbackQuery(
      callback.id,
      approved ? "تأیید شد" : "رد شد"
    );
    if (callback.message) {
      await api
        .editMessageReplyMarkup(
          String(callback.message.chat.id),
          callback.message.message_id
        )
        .catch(() => undefined);
    }
    await this.continueChat(api, chat);
  }

  private async startNewChat(api: TelegramApi, settings: TelegramSettings) {
    this.#database.saveTelegramSettings({
      ...settings,
      activeChatId: null,
    });
    this.emitStatus();
    await api.sendMessage(settings.pairedChatId!, "گفت‌وگوی تازه آماده است.", {
      replyMarkup: TELEGRAM_MAIN_KEYBOARD,
    });
  }

  private async showRecentChats(api: TelegramApi, settings: TelegramSettings) {
    const chats = listRecentWorkspaceChats(
      this.#database,
      settings.workspaceId
    );
    await api.sendMessage(
      settings.pairedChatId!,
      chats.length
        ? "یکی از گفت‌وگوهای اخیر این فضای کاری را انتخاب کنید:"
        : "هنوز گفت‌وگویی در این فضای کاری نیست. یک پیام بفرستید تا شروع شود.",
      {
        replyMarkup: recentChatsKeyboard(chats, settings.activeChatId),
      }
    );
  }

  private async showModelPicker(api: TelegramApi, settings: TelegramSettings) {
    const models = listPickableTelegramModels(this.#database);
    const activeChat = settings.activeChatId
      ? this.#database
          .loadChats()
          .find((chat) => chat.id === settings.activeChatId)
      : null;
    const active = activeChat
      ? { providerId: activeChat.providerId, modelId: activeChat.model }
      : settings.preferredProviderId && settings.preferredModelId
        ? {
            providerId: settings.preferredProviderId,
            modelId: settings.preferredModelId,
          }
        : null;
    await api.sendMessage(
      settings.pairedChatId!,
      models.length
        ? "مدل اجرای تلگرام را انتخاب کنید:"
        : "هیچ مدل فعالی در تنظیمات نیمروز نیست.",
      {
        replyMarkup: modelsKeyboard(models, active),
      }
    );
  }

  private async sendStatus(api: TelegramApi, settings: TelegramSettings) {
    const active = settings.activeChatId
      ? this.#database.listAgentRuns({
          chatId: settings.activeChatId,
          limit: 1,
        })[0]
      : null;
    const chat = settings.activeChatId
      ? this.#database
          .loadChats()
          .find((item) => item.id === settings.activeChatId)
      : null;
    const modelLabel = chat
      ? `${chat.providerId} · ${chat.model}`
      : settings.preferredProviderId && settings.preferredModelId
        ? `${settings.preferredProviderId} · ${settings.preferredModelId}`
        : "پیش‌فرض نیمروز";
    const status = this.#busy
      ? "نیمروز در حال انجام کار است."
      : active?.status === "awaiting_approval"
        ? "کار منتظر تأیید شماست."
        : active?.status === "failed"
          ? `آخرین اجرا ناموفق بود${active.error ? `: ${active.error}` : "."}`
          : active?.status === "completed"
            ? "آخرین اجرا با موفقیت تمام شد."
            : "کاری در حال اجرا نیست.";
    await this.sendText(
      api,
      settings.pairedChatId,
      `${status}\nگفت‌وگو: ${chat?.title ?? "تازه"}\nمدل: ${modelLabel}`
    );
  }

  private ensureChat(settings: TelegramSettings, firstPrompt: string) {
    const existing = settings.activeChatId
      ? this.#database.loadChats().find(
          (chat) =>
            chat.id === settings.activeChatId &&
            chat.workspaceId === settings.workspaceId
        )
      : null;
    if (existing) return existing;

    const resolved = this.#database.resolveChatModel(
      settings.preferredProviderId,
      settings.preferredModelId
    );
    if (!resolved) {
      throw new Error(
        "هیچ مدل فعالی در دسترس نیست. ابتدا یک مدل را در تنظیمات نیمروز فعال کنید."
      );
    }
    const now = Date.now();
    const compactTitle = firstPrompt.replace(/\s+/g, " ").slice(0, 52);
    const chat: LocalChat = {
      id: nanoid(),
      title: compactTitle ? `تلگرام · ${compactTitle}` : "تلگرام",
      providerId: resolved.provider.id,
      model: resolved.model.modelId,
      messages: [],
      workspaceId: settings.workspaceId,
      agentMode: "general",
      createdAt: now,
      updatedAt: now,
      titleIsCustom: true,
    };
    this.#database.saveChats([chat]);
    this.#database.saveTelegramSettings({
      ...settings,
      activeChatId: chat.id,
      preferredProviderId: resolved.provider.id,
      preferredModelId: resolved.model.modelId,
    });
    this.emitStatus();
    this.emitChat(chat);
    return chat;
  }

  private async runUserPrompt(api: TelegramApi, text: string) {
    const settings = this.#database.loadTelegramSettings();
    try {
      const chat = this.ensureChat(settings, text);
      const userMessage: ChatUIMessage = {
        id: nanoid(),
        role: "user",
        parts: [{ type: "text", text }],
      };
      chat.messages = [...chat.messages, userMessage];
      chat.updatedAt = Date.now();
      this.#database.saveChats([chat]);
      this.emitChat(chat);
      await this.continueChat(api, chat);
    } catch (error) {
      await this.sendText(
        api,
        settings.pairedChatId,
        `خطا: ${getChatErrorMessage(error)}`
      );
    }
  }

  private async continueChat(api: TelegramApi, chat: LocalChat) {
    const settings = this.#database.loadTelegramSettings();
    if (!settings.pairedChatId) return;
    this.#busy = true;
    this.#agentAbort = new AbortController();
    this.emitStatus();
    try {
      const lastMessage = chat.messages.at(-1) as ChatUIMessage | undefined;
      const resumeAssistant =
        lastMessage?.role === "assistant" ? lastMessage : undefined;
      const response = await this.#runAgent(
        {
          messages: chat.messages as ChatUIMessage[],
          providerId: chat.providerId,
          model: chat.model,
          personalization: this.#database.loadPersonalization(),
          memories: this.#database.loadMemories(),
          experts: this.#database.loadExperts(),
          subagents: this.#database.loadSubagents(),
          chatId: chat.id,
          workspaceId: chat.workspaceId,
          agentMode: "general",
          remoteChannel: "telegram",
        },
        this.#agentDeps,
        this.#agentAbort.signal
      );
      const assistant = await readAgentResponse(response, resumeAssistant);
      if (!assistant) throw new Error("پاسخی از مدل دریافت نشد.");
      chat.messages = replaceOrAppendAssistant(
        chat.messages as ChatUIMessage[],
        assistant,
        Boolean(resumeAssistant)
      );
      chat.updatedAt = Date.now();
      this.#database.saveChats([chat]);
      this.emitChat(chat);

      const text = textFromMessage(assistant);
      if (text) await this.sendText(api, settings.pairedChatId, text, { html: true });

      const approval = findManualApproval(assistant);
      if (approval) {
        if (approval.approval.id.length > 56) {
          await this.sendText(
            api,
            settings.pairedChatId,
            "این درخواست به تأیید نیاز دارد، اما شناسه آن برای تلگرام بیش از حد طولانی است. آن را در برنامه دسکتاپ بررسی کنید."
          );
          return;
        }
        await api.sendMessage(
          settings.pairedChatId,
          approvalSummary(approval),
          {
            replyMarkup: {
              inline_keyboard: [
                [
                  {
                    text: "✅ تأیید",
                    callback_data: `ta:${approval.approval.id}`,
                  },
                  {
                    text: "🚫 رد",
                    callback_data: `td:${approval.approval.id}`,
                  },
                ],
              ],
            },
          }
        );
      } else if (!text) {
        await api.sendMessage(settings.pairedChatId, "کار انجام شد.");
      }
    } catch (error) {
      if (!this.#agentAbort?.signal.aborted) {
        await this.sendText(
          api,
          settings.pairedChatId,
          `خطا: ${getChatErrorMessage(error)}`
        );
      }
    } finally {
      this.#busy = false;
      this.#agentAbort = null;
      this.emitStatus();
    }
  }

  private respondToApproval(
    chat: LocalChat,
    approvalId: string,
    approved: boolean
  ) {
    let matched = false;
    chat.messages = chat.messages.map((message) => ({
      ...message,
      parts: message.parts.map((part) => {
        if (
          matched ||
          !part.type.startsWith("tool-") ||
          !("state" in part) ||
          part.state !== "approval-requested" ||
          !("approval" in part)
        ) {
          return part;
        }
        const candidate = part as unknown as ManualApprovalPart;
        if (candidate.approval.id !== approvalId) return part;
        matched = true;
        return {
          ...candidate,
          state: "approval-responded" as const,
          approval: {
            ...candidate.approval,
            approved,
            ...(!approved ? { reason: "Denied from Telegram." } : {}),
          },
        } as unknown as typeof part;
      }),
    }));
    if (!matched) return false;
    chat.updatedAt = Date.now();
    this.#database.saveChats([chat]);
    this.emitChat(chat);
    return true;
  }

  private async sendText(
    api: TelegramApi,
    chatId: string | null,
    text: string,
    options: {
      html?: boolean;
      replyMarkup?: TelegramReplyMarkup;
    } = {}
  ) {
    if (!chatId) return;
    const chunks = splitTelegramChunks(text);
    for (const [index, chunk] of chunks.entries()) {
      const replyMarkup =
        index === chunks.length - 1 ? options.replyMarkup : undefined;
      if (options.html) {
        const html = markdownToTelegramHtml(chunk);
        try {
          await api.sendMessage(chatId, html, {
            parseMode: "HTML",
            replyMarkup,
          });
          continue;
        } catch {
          // Odd Markdown can produce invalid Telegram HTML; send plain text.
        }
      }
      await api.sendMessage(chatId, chunk, { replyMarkup });
    }
  }
}
