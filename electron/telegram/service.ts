import { randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
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
import { getTelegramErrorMessage } from "@/lib/telegram-errors";
import { CODEX_PROVIDER_ID } from "@/lib/models/catalog";
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
  normalizeTelegramProxySettings,
  type TelegramProxySettings,
  type TelegramSettings,
  type TelegramStatus,
} from "@/lib/telegram";
import {
  markdownToTelegramHtml,
  splitTelegramChunks,
} from "@/lib/telegram-format";
import {
  buildTelegramHelpMessage,
  buildTelegramPairedWelcomeMessage,
  buildTelegramUnpairedStartMessage,
} from "@/lib/telegram-messages";
import { classifyFile } from "@/lib/workspace";
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
  buildTelegramUserContent,
  collectArtifactDeliverables,
  extractTelegramInboundMedia,
  telegramDocumentFilename,
  TELEGRAM_INBOUND_MAX_BYTES,
  TELEGRAM_OUTBOUND_MAX_BYTES,
  validateTelegramInboundMedia,
} from "./media";
import {
  listPickableTelegramModels,
  listRecentWorkspaceChats,
  modelsKeyboard,
  recentChatsKeyboard,
} from "./menus";

export { TELEGRAM_CHAT_CHANNEL, TELEGRAM_STATUS_CHANNEL };

const MAX_PROMPT_LENGTH = 12_000;
const TRANSCRIPT_EPHEMERAL_MS = 4_500;
/** Minimum gap between Telegram status message edits (Bot API rate limits). */
const PROGRESS_EDIT_MIN_MS = 2_000;
/** Telegram typing indicators expire after ~5s; refresh before that. */
const TYPING_REFRESH_MS = 4_000;
const MAX_PROGRESS_STEPS = 6;
const PROGRESS_SUBJECT_MAX = 48;
const TOOL_PROGRESS_LABELS: Record<string, string> = {
  list_directory: "فهرست فایل‌ها",
  read_file: "خواندن فایل",
  search_files: "جستجو",
  grep: "جستجو",
  write_file: "نوشتن فایل",
  apply_patch: "اعمال تغییر",
  move_file: "انتقال فایل",
  delete_file: "حذف فایل",
  run_command: "اجرای دستور",
  fetch_url: "دریافت صفحه",
  web_search: "جستجوی وب",
  create_artifact: "ساخت آرتیفکت",
  update_task: "به‌روزرسانی تسک",
  write_plan: "ذخیره پلن",
  update_plan: "به‌روزرسانی پلن",
  read_active_plan: "خواندن پلن",
  update_plan_progress: "ثبت پیشرفت پلن",
  update_plan_status: "وضعیت پلن",
  ask_user_question: "پرسش از شما",
  load_skill: "بارگذاری مهارت",
  create_skill: "ساخت مهارت",
  save_memory: "ذخیره حافظه",
  delete_memory: "حذف حافظه",
  create_expert: "ساخت متخصص",
};

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

export type TelegramProgressStepState =
  | "running"
  | "done"
  | "error"
  | "approval"
  | "denied";

export type TelegramProgressStep = {
  toolName: string;
  state: TelegramProgressStepState;
  subject: string | null;
};

export type TelegramAgentProgress = {
  steps: TelegramProgressStep[];
  phase: "starting" | "tools" | "writing" | "waiting_approval";
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
  applyProxy?: (proxy: TelegramProxySettings) => Promise<void>;
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

function toolProgressLabel(toolName: string): string {
  if (TOOL_PROGRESS_LABELS[toolName]) return TOOL_PROGRESS_LABELS[toolName];
  if (toolName.startsWith("mcp_")) {
    const bare = toolName.replace(/^mcp_[^_]+_/, "").replace(/^mcp_/, "");
    return bare ? `ابزار MCP · ${bare}` : "ابزار MCP";
  }
  return toolName.replace(/_/g, " ");
}

function progressSubject(input: unknown): string | null {
  if (!input || typeof input !== "object") return null;
  const record = input as Record<string, unknown>;
  const candidate =
    record.command ??
    record.path ??
    record.from ??
    record.url ??
    record.query ??
    record.title ??
    record.question ??
    record.name;
  if (typeof candidate !== "string") return null;
  const normalized = candidate.replace(/\s+/g, " ").trim();
  if (!normalized) return null;
  return normalized.length > PROGRESS_SUBJECT_MAX
    ? `${normalized.slice(0, PROGRESS_SUBJECT_MAX - 1)}…`
    : normalized;
}

function mapToolProgressState(state: string): TelegramProgressStepState | null {
  switch (state) {
    case "input-streaming":
    case "input-available":
    case "approval-responded":
      return "running";
    case "approval-requested":
      return "approval";
    case "output-available":
      return "done";
    case "output-error":
      return "error";
    case "output-denied":
      return "denied";
    default:
      return null;
  }
}

/** Build a compact progress snapshot from the streaming assistant message. */
export function agentProgressFromMessage(
  message: ChatUIMessage | undefined
): TelegramAgentProgress {
  const steps: TelegramProgressStep[] = [];
  let hasText = false;
  if (message) {
    for (const part of message.parts) {
      if (part.type === "text" && "text" in part) {
        const text = typeof part.text === "string" ? part.text.trim() : "";
        if (text) hasText = true;
      }
      if (!part.type.startsWith("tool-") || !("state" in part)) continue;
      const mapped = mapToolProgressState(String(part.state));
      if (!mapped) continue;
      const toolName = part.type.replace(/^tool-/, "");
      const input =
        "input" in part ? (part as { input?: unknown }).input : undefined;
      steps.push({
        toolName,
        state: mapped,
        subject: progressSubject(input),
      });
    }
  }

  const visibleSteps = steps.slice(-MAX_PROGRESS_STEPS);
  const waitingApproval = visibleSteps.some((step) => step.state === "approval");
  const toolsActive = visibleSteps.some(
    (step) => step.state === "running" || step.state === "approval"
  );
  let phase: TelegramAgentProgress["phase"] = "starting";
  if (waitingApproval) phase = "waiting_approval";
  else if (toolsActive) phase = "tools";
  else if (hasText) phase = "writing";
  else if (visibleSteps.length > 0) phase = "tools";

  return { steps: visibleSteps, phase };
}

export function progressSignature(progress: TelegramAgentProgress): string {
  return JSON.stringify({
    phase: progress.phase,
    steps: progress.steps.map((step) => [
      step.toolName,
      step.state,
      step.subject,
    ]),
  });
}

export function formatTelegramAgentProgress(
  progress: TelegramAgentProgress
): string {
  // Empty while the model is only "thinking" — typing indicator covers that.
  if (progress.steps.length === 0) return "";

  const lines: string[] = [];
  for (const step of progress.steps) {
    const mark =
      step.state === "done"
        ? "✓"
        : step.state === "error"
          ? "✗"
          : step.state === "denied"
            ? "⊘"
            : step.state === "approval"
              ? "⏸"
              : "→";
    const label = toolProgressLabel(step.toolName);
    const subject = step.subject ? ` · ${step.subject}` : "";
    if (step.state === "approval") {
      lines.push(`${mark} منتظر تأیید · ${label}${subject}`);
    } else {
      lines.push(`${mark} ${label}${subject}`);
    }
  }

  if (progress.phase === "writing") {
    lines.push("", "در حال نوشتن پاسخ…");
  } else if (progress.phase === "waiting_approval") {
    lines.push("", "برای ادامه باید تأیید کنید.");
  }

  return lines.join("\n");
}

type TypingIndicator = {
  dispose: () => void;
};

/** Keeps the Telegram "typing…" bubble alive for long agent runs. */
function createTypingIndicator(
  api: TelegramApi,
  chatId: string,
  intervalMs = TYPING_REFRESH_MS
): TypingIndicator {
  let stopped = false;
  const pulse = () => {
    if (stopped) return;
    void api.sendChatAction(chatId, "typing").catch(() => undefined);
  };
  pulse();
  const timer = setInterval(pulse, intervalMs);
  return {
    dispose() {
      stopped = true;
      clearInterval(timer);
    },
  };
}

type ProgressUpdater = {
  onMessage: (message: ChatUIMessage) => void;
  dispose: () => Promise<void>;
};

/**
 * Lazy tool-progress status: no message until the first real tool step.
 * Typing covers the idle "thinking" phase.
 */
function createProgressUpdater(
  api: TelegramApi,
  chatId: string,
  minIntervalMs = PROGRESS_EDIT_MIN_MS
): ProgressUpdater {
  let messageId: number | null = null;
  let lastSignature = "";
  let lastSentAt = 0;
  let pendingText: string | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let closed = false;
  let chain: Promise<void> = Promise.resolve();

  const publish = (text: string) => {
    chain = chain
      .then(async () => {
        if (closed || !text) return;
        try {
          if (messageId == null) {
            const sent = await api.sendMessage(chatId, text);
            messageId = sent.message_id;
          } else {
            await api.editMessageText(chatId, messageId, text);
          }
          lastSentAt = Date.now();
        } catch {
          // Ignore "message is not modified", deleted messages, and transient errors.
        }
      })
      .catch(() => undefined);
    return chain;
  };

  const flushPending = () => {
    timer = null;
    if (closed || !pendingText) return;
    const text = pendingText;
    pendingText = null;
    void publish(text);
  };

  return {
    onMessage(message) {
      if (closed) return;
      const progress = agentProgressFromMessage(message);
      // Skip empty thinking snapshots — typing is enough.
      if (progress.steps.length === 0) return;
      const signature = progressSignature(progress);
      if (signature === lastSignature) return;
      lastSignature = signature;
      const text = formatTelegramAgentProgress(progress);
      if (!text) return;
      const elapsed = lastSentAt === 0 ? minIntervalMs : Date.now() - lastSentAt;
      if (elapsed >= minIntervalMs) {
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
        pendingText = null;
        void publish(text);
        return;
      }
      pendingText = text;
      if (!timer) {
        timer = setTimeout(flushPending, minIntervalMs - elapsed);
      }
    },
    async dispose() {
      closed = true;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      pendingText = null;
      await chain;
      if (messageId != null) {
        await api.deleteMessage(chatId, messageId).catch(() => undefined);
        messageId = null;
      }
    },
  };
}

/** Resume from the last assistant message when continuing after tool approvals. */
export async function readAgentResponse(
  response: Response,
  previousAssistant?: ChatUIMessage,
  options?: {
    onProgress?: (message: ChatUIMessage) => void;
  }
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
    options?.onProgress?.(next);
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
  readonly #applyProxy: (proxy: TelegramProxySettings) => Promise<void>;
  readonly #onStatusChange?: (status: TelegramStatus) => void;
  readonly #onChatChange?: (chat: LocalChat) => void;

  #connectionState: TelegramStatus["connectionState"] = "disconnected";
  #error: string | null = null;
  #pairingCode: string | null = null;
  #pollAbort: AbortController | null = null;
  #agentAbort: AbortController | null = null;
  #pollGeneration = 0;
  #busy = false;
  #pendingDeletes = new Set<ReturnType<typeof setTimeout>>();

  constructor(options: TelegramServiceOptions) {
    this.#database = options.database;
    this.#credentials = options.credentials;
    this.#agentDeps = options.agentDeps;
    this.#runAgent = options.runAgent;
    this.#shenava = options.shenava;
    this.#fetchImpl = options.fetchImpl ?? globalThis.fetch;
    this.#applyProxy = options.applyProxy ?? (async () => undefined);
    this.#onStatusChange = options.onStatusChange;
    this.#onChatChange = options.onChatChange;
  }

  async initialize() {
    const settings = this.#database.loadTelegramSettings();
    try {
      await this.#applyProxy(settings.proxy);
      if (settings.enabled && this.#credentials.getKey(TELEGRAM_CREDENTIAL_ID)) {
        this.startPolling();
      } else {
        this.#connectionState = settings.enabled ? "disconnected" : "disabled";
        this.emitStatus();
      }
    } catch (error) {
      this.#connectionState = "error";
      this.#error = getTelegramErrorMessage(error);
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
    try {
      await this.#applyProxy(this.#database.loadTelegramSettings().proxy);
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
    } catch (error) {
      const message = getTelegramErrorMessage(error);
      this.#connectionState = "error";
      this.#error = message;
      this.emitStatus();
      throw new Error(message);
    }
  }

  async setProxy(value: unknown) {
    const proxy = normalizeTelegramProxySettings(value);
    const settings = this.#database.saveTelegramSettings({
      ...this.#database.loadTelegramSettings(),
      proxy,
    });
    this.stopPolling();

    try {
      await this.#applyProxy(proxy);
      const token = this.#credentials.getKey(TELEGRAM_CREDENTIAL_ID);
      if (token) {
        await new TelegramApi(token, this.#fetchImpl).getMe(
          AbortSignal.timeout(15_000)
        );
      }
      this.#error = null;
      if (settings.enabled && token) this.startPolling();
      else this.emitStatus();
      return this.getStatus();
    } catch (error) {
      const message = getTelegramErrorMessage(error);
      this.#connectionState = "error";
      this.#error = message;
      this.emitStatus();
      throw new Error(message);
    }
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
    for (const timeout of this.#pendingDeletes) clearTimeout(timeout);
    this.#pendingDeletes.clear();
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
        this.#error = getTelegramErrorMessage(error);
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
    const hasText = typeof message.text === "string";
    const hasVoice = Boolean(message.voice);
    const hasMedia = Boolean(
      message.document || (message.photo && message.photo.length > 0)
    );
    if (
      message.chat.type !== "private" ||
      !message.from ||
      message.from.is_bot ||
      (!hasText && !hasVoice && !hasMedia)
    ) {
      return;
    }

    const text = message.text?.trim() ?? "";
    const settings = this.#database.loadTelegramSettings();
    const workspaceTitle =
      this.#database.getWorkspace(settings.workspaceId)?.title ?? null;
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
        buildTelegramPairedWelcomeMessage({
          botUsername: settings.botUsername,
          workspaceTitle,
        }),
        {
          parseMode: "HTML",
          replyMarkup: TELEGRAM_MAIN_KEYBOARD,
        }
      );
      return;
    }

    if (
      String(message.from.id) !== settings.pairedUserId ||
      String(message.chat.id) !== settings.pairedChatId
    ) {
      // Friendly guide for strangers / unpaired /start attempts only.
      if (
        /^\/start(?:@\w+)?(?:\s+\S+)?$/.test(text) ||
        text === "/help" ||
        text === TELEGRAM_BUTTONS.help
      ) {
        await api.sendMessage(
          String(message.chat.id),
          buildTelegramUnpairedStartMessage({
            botUsername: settings.botUsername,
          }),
          { parseMode: "HTML" }
        );
      }
      return;
    }

    if (message.voice) {
      await this.handleVoice(api, message);
      return;
    }

    if (hasMedia) {
      await this.handleMedia(api, message);
      return;
    }

    if (
      /^\/start(?:@\w+)?$/.test(text) ||
      text === "/help" ||
      text === TELEGRAM_BUTTONS.help
    ) {
      await api.sendMessage(
        settings.pairedChatId,
        buildTelegramHelpMessage({
          botUsername: settings.botUsername,
          workspaceTitle,
          paired: true,
        }),
        {
          parseMode: "HTML",
          replyMarkup: TELEGRAM_MAIN_KEYBOARD,
        }
      );
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

    await this.runUserPrompt(api, { text });
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
    // record_voice / typing both work; typing is the familiar "bot is working" cue.
    const typing = createTypingIndicator(api, settings.pairedChatId);
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
      typing.dispose();
      await this.sendEphemeralText(
        api,
        settings.pairedChatId,
        `شنیدم:\n${transcript}`,
        TRANSCRIPT_EPHEMERAL_MS
      );
      await this.runUserPrompt(api, { text: transcript });
    } catch (error) {
      typing.dispose();
      await this.sendText(
        api,
        settings.pairedChatId,
        `رونویسی پیام صوتی ناموفق بود: ${getTelegramErrorMessage(
          error,
          "پردازش پیام صوتی با خطا روبه‌رو شد. دوباره تلاش کنید."
        )}`
      );
    } finally {
      typing.dispose();
      if (!this.#agentAbort) {
        this.#busy = false;
        this.emitStatus();
      }
    }
  }

  private async handleMedia(api: TelegramApi, message: TelegramMessage) {
    const settings = this.#database.loadTelegramSettings();
    if (!settings.pairedChatId) return;
    if (this.#busy) {
      await api.sendMessage(
        settings.pairedChatId,
        "یک کار دیگر هنوز در حال اجراست. پس از پایان آن دوباره فایل را بفرستید."
      );
      return;
    }

    const media = extractTelegramInboundMedia(message);
    if (!media) return;

    // Resolve model flags using the chat that would handle this turn.
    const previewChat = settings.activeChatId
      ? this.#database
          .loadChats()
          .find(
            (chat) =>
              chat.id === settings.activeChatId &&
              chat.workspaceId === settings.workspaceId
          )
      : null;
    const resolved =
      previewChat != null
        ? this.#database.resolveChatModel(
            previewChat.providerId,
            previewChat.model
          )
        : this.#database.resolveChatModel(
            settings.preferredProviderId,
            settings.preferredModelId
          );
    if (!resolved) {
      await api.sendMessage(
        settings.pairedChatId,
        "هیچ مدل فعالی در دسترس نیست. ابتدا یک مدل را در تنظیمات نیمروز فعال کنید."
      );
      return;
    }
    if (resolved.provider.id === CODEX_PROVIDER_ID) {
      await api.sendMessage(
        settings.pairedChatId,
        "پیوست فایل در حالت Codex از تلگرام پشتیبانی نمی‌شود. مدل دیگری انتخاب کنید یا متن بفرستید."
      );
      return;
    }

    const validation = validateTelegramInboundMedia(media, {
      supportsImages: resolved.model.supportsImages,
    });
    if (!validation.ok) {
      await api.sendMessage(settings.pairedChatId, validation.reason);
      return;
    }

    this.#busy = true;
    this.emitStatus();
    const typing = createTypingIndicator(api, settings.pairedChatId);
    try {
      const bytes = await api.downloadFile(
        media.fileId,
        AbortSignal.timeout(60_000)
      );
      if (bytes.byteLength > TELEGRAM_INBOUND_MAX_BYTES) {
        throw new Error(
          "حجم این فایل برای دریافت از تلگرام بیش از حد زیاد است (حداکثر ۲۰ مگابایت)."
        );
      }
      const base64 = Buffer.from(bytes).toString("base64");
      const imported = this.#agentDeps.files.importFiles(settings.workspaceId, [
        {
          name: media.fileName,
          base64,
          mimeType: media.mimeType,
        },
      ]);
      const item = imported[0];
      if (!item) throw new Error("ذخیره فایل در فضای کاری ناموفق بود.");

      const content = buildTelegramUserContent({
        caption: media.caption,
        imported: [
          {
            name: item.name,
            relativePath: item.relativePath,
            mimeType: item.mimeType,
            category: classifyFile(item.name),
            base64: media.isImage ? base64 : undefined,
          },
        ],
        supportsImages: resolved.model.supportsImages,
      });
      if (content.parts.length === 0) {
        throw new Error("محتوای قابل‌ارسالی از این فایل ساخته نشد.");
      }

      typing.dispose();
      await this.runUserPrompt(api, {
        parts: content.parts,
        metadata: content.metadata,
        titleSeed: content.titleSeed,
        textForLimits: content.textForLimits,
      });
    } catch (error) {
      typing.dispose();
      await this.sendText(
        api,
        settings.pairedChatId,
        `دریافت فایل ناموفق بود: ${getTelegramErrorMessage(
          error,
          "دریافت یا پردازش فایل با خطا روبه‌رو شد. دوباره تلاش کنید."
        )}`
      );
    } finally {
      typing.dispose();
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
    try {
      await this.continueChat(api, chat);
    } finally {
      if (callback.message) {
        await this.deleteMessageNow(
          api,
          String(callback.message.chat.id),
          callback.message.message_id
        );
      }
    }
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

  private async runUserPrompt(
    api: TelegramApi,
    input: {
      text?: string;
      parts?: ChatUIMessage["parts"];
      metadata?: ChatUIMessage["metadata"];
      titleSeed?: string;
      textForLimits?: string;
    }
  ) {
    const settings = this.#database.loadTelegramSettings();
    try {
      const text = input.text?.trim() ?? "";
      const parts =
        input.parts ??
        (text ? ([{ type: "text" as const, text }] as ChatUIMessage["parts"]) : []);
      if (parts.length === 0) {
        throw new Error("پیام خالی است.");
      }
      const limitSource = input.textForLimits ?? text;
      if (limitSource.length > MAX_PROMPT_LENGTH) {
        throw new Error(
          `پیام باید حداکثر ${MAX_PROMPT_LENGTH.toLocaleString("fa-IR")} نویسه باشد.`
        );
      }
      const chat = this.ensureChat(
        settings,
        input.titleSeed ?? (text || "گفتگوی تلگرام")
      );
      const userMessage: ChatUIMessage = {
        id: nanoid(),
        role: "user",
        parts,
        ...(input.metadata ? { metadata: input.metadata } : {}),
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
        `خطا: ${getTelegramErrorMessage(
          error,
          "اجرای درخواست با خطا روبه‌رو شد. دوباره تلاش کنید."
        )}`
      );
    }
  }

  private async continueChat(api: TelegramApi, chat: LocalChat) {
    const settings = this.#database.loadTelegramSettings();
    if (!settings.pairedChatId) return;
    this.#busy = true;
    this.#agentAbort = new AbortController();
    this.emitStatus();

    const typing = createTypingIndicator(api, settings.pairedChatId);
    const progressUpdater = createProgressUpdater(api, settings.pairedChatId);
    try {
      const lastMessage = chat.messages.at(-1) as ChatUIMessage | undefined;
      const resumeAssistant =
        lastMessage?.role === "assistant" ? lastMessage : undefined;
      // Show resumed tool state immediately (e.g. after approval).
      if (resumeAssistant) progressUpdater.onMessage(resumeAssistant);

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
      const assistant = await readAgentResponse(response, resumeAssistant, {
        onProgress: (message) => progressUpdater.onMessage(message),
      });
      if (!assistant) throw new Error("پاسخی از مدل دریافت نشد.");
      chat.messages = replaceOrAppendAssistant(
        chat.messages as ChatUIMessage[],
        assistant,
        Boolean(resumeAssistant)
      );
      chat.updatedAt = Date.now();
      this.#database.saveChats([chat]);
      this.emitChat(chat);

      typing.dispose();
      await progressUpdater.dispose();

      // Send create_artifact outputs as Telegram documents before the text reply.
      await this.deliverArtifacts(api, settings.pairedChatId, chat, assistant);

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
          `خطا: ${getTelegramErrorMessage(
            error,
            "ادامهٔ درخواست با خطا روبه‌رو شد. دوباره تلاش کنید."
          )}`
        );
      }
    } finally {
      typing.dispose();
      await progressUpdater.dispose();
      this.#busy = false;
      this.#agentAbort = null;
      this.emitStatus();
    }
  }

  private async deliverArtifacts(
    api: TelegramApi,
    chatId: string,
    chat: LocalChat,
    assistant: ChatUIMessage
  ) {
    const deliverables = collectArtifactDeliverables(assistant);
    if (deliverables.length === 0) return;

    const workspaceId = chat.workspaceId;
    if (!workspaceId) return;

    const records = this.#database.listArtifacts(workspaceId);
    const byId = new Map(records.map((item) => [item.id, item] as const));

    for (const item of deliverables) {
      try {
        const record = byId.get(item.id);
        const storagePath = record?.storagePath ?? item.path;
        if (!storagePath || !existsSync(storagePath)) {
          await this.sendText(
            api,
            chatId,
            `آرتیفکت «${item.title}» ساخته شد اما فایل آن پیدا نشد.`
          );
          continue;
        }
        const sizeBytes = record?.sizeBytes ?? item.sizeBytes;
        if (sizeBytes != null && sizeBytes > TELEGRAM_OUTBOUND_MAX_BYTES) {
          await this.sendText(
            api,
            chatId,
            `آرتیفکت «${item.title}» بزرگ‌تر از حد ارسال تلگرام است (حداکثر ۲۰ مگابایت). آن را در نیمروز باز کنید.`
          );
          continue;
        }
        const bytes = new Uint8Array(readFileSync(storagePath));
        if (bytes.byteLength > TELEGRAM_OUTBOUND_MAX_BYTES) {
          await this.sendText(
            api,
            chatId,
            `آرتیفکت «${item.title}» بزرگ‌تر از حد ارسال تلگرام است. آن را در نیمروز باز کنید.`
          );
          continue;
        }
        const filename = telegramDocumentFilename(item.title, storagePath);
        const mimeType =
          record?.mimeType ||
          (path.extname(storagePath).toLowerCase() === ".svg"
            ? "image/svg+xml"
            : "application/octet-stream");
        const caption = item.title.slice(0, 1024);

        // Raster-ish SVG is still sent as a document; jpeg/png artifacts as photo.
        const isPhoto =
          mimeType === "image/jpeg" ||
          mimeType === "image/png" ||
          mimeType === "image/webp";
        if (isPhoto) {
          await api.sendPhoto(
            chatId,
            { bytes, filename, mimeType },
            { caption }
          );
        } else {
          await api.sendDocument(
            chatId,
            { bytes, filename, mimeType },
            { caption }
          );
        }
      } catch (error) {
        await this.sendText(
          api,
          chatId,
          `ارسال آرتیفکت «${item.title}» ناموفق بود: ${getTelegramErrorMessage(
            error,
            "فایل ساخته شد اما ارسال آن به تلگرام با خطا روبه‌رو شد."
          )}`
        );
      }
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
    await this.sendTextMessages(api, chatId, text, options);
  }

  private async sendEphemeralText(
    api: TelegramApi,
    chatId: string | null,
    text: string,
    delayMs: number,
    options: {
      html?: boolean;
      replyMarkup?: TelegramReplyMarkup;
    } = {}
  ) {
    const messages = await this.sendTextMessages(api, chatId, text, options);
    for (const message of messages) {
      this.deleteMessageLater(api, chatId!, message.message_id, delayMs);
    }
  }

  private async sendTextMessages(
    api: TelegramApi,
    chatId: string | null,
    text: string,
    options: {
      html?: boolean;
      replyMarkup?: TelegramReplyMarkup;
    } = {}
  ) {
    if (!chatId) return [];
    const chunks = splitTelegramChunks(text);
    const sent: TelegramMessage[] = [];
    for (const [index, chunk] of chunks.entries()) {
      const replyMarkup =
        index === chunks.length - 1 ? options.replyMarkup : undefined;
      if (options.html) {
        const html = markdownToTelegramHtml(chunk);
        try {
          sent.push(
            await api.sendMessage(chatId, html, {
              parseMode: "HTML",
              replyMarkup,
            })
          );
          continue;
        } catch {
          // Odd Markdown can produce invalid Telegram HTML; send plain text.
        }
      }
      sent.push(await api.sendMessage(chatId, chunk, { replyMarkup }));
    }
    return sent;
  }

  private deleteMessageLater(
    api: TelegramApi,
    chatId: string,
    messageId: number,
    delayMs: number
  ) {
    if (delayMs <= 0) {
      void this.deleteMessageNow(api, chatId, messageId);
      return;
    }
    const timeout = setTimeout(() => {
      this.#pendingDeletes.delete(timeout);
      void this.deleteMessageNow(api, chatId, messageId);
    }, delayMs);
    this.#pendingDeletes.add(timeout);
  }

  private async deleteMessageNow(
    api: TelegramApi,
    chatId: string,
    messageId: number
  ) {
    await api.deleteMessage(chatId, messageId).catch(() => undefined);
  }
}
