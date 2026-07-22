import { isAgentMode, type AgentMode } from "@/lib/chat/agent-mode";
import type { ChatUIMessage } from "@/lib/chat/message";
import type { ProviderModelRef } from "@/lib/models/catalog";

export const COMPANION_MAX_PROMPT_LENGTH = 12_000;
export const COMPANION_MAX_SCREENSHOT_BYTES = 8 * 1024 * 1024;
export const COMPANION_WINDOW_SIZE = { width: 420, height: 600 } as const;

export type CompanionScreenshot = {
  name: string;
  mediaType: "image/jpeg" | "image/png";
  base64: string;
  width: number;
  height: number;
};

export type CompanionDraft = {
  text: string;
  screenshot?: CompanionScreenshot;
  chatId?: string;
  workspaceId?: string;
  model?: ProviderModelRef;
  agentMode?: AgentMode;
};

export type CompanionPromptRequest = CompanionDraft & {
  requestId: string;
};

export type CompanionSubmissionStatus = {
  requestId: string;
  state: "accepted" | "running" | "completed" | "failed";
  chatId?: string;
  workspaceId?: string;
  message?: string;
};

export type CompanionOpenChatRequest = {
  chatId: string;
  workspaceId: string;
};

export type CompanionConversationMessage = {
  id: string;
  role: "user" | "assistant";
  parts: CompanionConversationPart[];
  metadata?: ChatUIMessage["metadata"];
};

/** A structured AI SDK message part, preserved for the shared chat renderer. */
export type CompanionConversationPart = ChatUIMessage["parts"][number];

export type CompanionConversationSnapshot = {
  chatId: string;
  workspaceId: string;
  title: string;
  state: "idle" | "running" | "failed";
  messages: CompanionConversationMessage[];
};

export type CompanionScreenCapturePermission =
  | "granted"
  | "not-determined"
  | "denied"
  | "restricted"
  | "not-required"
  | "unknown";

type RectangleLike = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export function positionCompanionWindow(
  trayBounds: RectangleLike,
  workArea: RectangleLike,
  windowSize = COMPANION_WINDOW_SIZE
) {
  const gap = 8;
  const margin = 8;
  const anchorX = trayBounds.width
    ? trayBounds.x + trayBounds.width / 2
    : workArea.x + workArea.width - margin;
  const trayIsAboveCenter =
    trayBounds.height > 0 &&
    trayBounds.y + trayBounds.height / 2 < workArea.y + workArea.height / 2;
  const preferredY = trayIsAboveCenter
    ? trayBounds.y + trayBounds.height + gap
    : trayBounds.y - windowSize.height - gap;
  const minX = workArea.x + margin;
  const maxX = Math.max(
    minX,
    workArea.x + workArea.width - windowSize.width - margin
  );
  const minY = workArea.y + margin;
  const maxY = Math.max(
    minY,
    workArea.y + workArea.height - windowSize.height - margin
  );

  return {
    x: Math.round(
      Math.min(maxX, Math.max(minX, anchorX - windowSize.width / 2))
    ),
    y: Math.round(Math.min(maxY, Math.max(minY, preferredY))),
  };
}

function isSafeId(value: unknown): value is string {
  return typeof value === "string" && /^[\w-]{1,128}$/.test(value);
}

function isSafeModelId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 256 &&
    !/[\u0000-\u001f\u007f]/.test(value)
  );
}

function isSafeMessageId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 160 &&
    !/[\u0000-\u001f\u007f]/.test(value)
  );
}

function approximateBase64Bytes(value: string) {
  const padding = value.endsWith("==") ? 2 : value.endsWith("=") ? 1 : 0;
  return Math.floor((value.length * 3) / 4) - padding;
}

const COMPANION_MAX_PARTS_PER_MESSAGE = 80;
const COMPANION_MAX_VALUE_DEPTH = 12;
const COMPANION_MAX_VALUE_ITEMS = 120;
const COMPANION_MAX_VALUE_STRING_LENGTH = 64_000;
const COMPANION_MAX_DATA_URL_LENGTH =
  Math.ceil((COMPANION_MAX_SCREENSHOT_BYTES * 4) / 3) + 256;

function sanitizeCloneableValue(
  value: unknown,
  depth = 0,
  key = ""
): unknown {
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const maxLength =
      key === "url" && value.startsWith("data:image/")
        ? COMPANION_MAX_DATA_URL_LENGTH
        : COMPANION_MAX_VALUE_STRING_LENGTH;
    return value.slice(0, maxLength);
  }
  if (depth >= COMPANION_MAX_VALUE_DEPTH) return undefined;
  if (Array.isArray(value)) {
    return value
      .slice(0, COMPANION_MAX_VALUE_ITEMS)
      .map((item) => sanitizeCloneableValue(item, depth + 1))
      .filter((item) => item !== undefined);
  }
  if (!value || typeof value !== "object") return undefined;

  const output: Record<string, unknown> = {};
  for (const [entryKey, entryValue] of Object.entries(value).slice(
    0,
    COMPANION_MAX_VALUE_ITEMS
  )) {
    const sanitized = sanitizeCloneableValue(
      entryValue,
      depth + 1,
      entryKey
    );
    if (sanitized !== undefined) output[entryKey] = sanitized;
  }
  return output;
}

function sanitizeConversationPart(
  value: unknown
): CompanionConversationPart | null {
  if (!value || typeof value !== "object" || !("type" in value)) return null;
  const part = value as Record<string, unknown>;
  if (
    typeof part.type !== "string" ||
    !/^(?:text|reasoning|file|step-start|source-url|source-document|tool-[\w-]{1,100}|data-[\w-]{1,100})$/.test(
      part.type
    )
  ) {
    return null;
  }
  if (
    (part.type === "text" || part.type === "reasoning") &&
    typeof part.text !== "string"
  ) {
    return null;
  }
  if (part.type.startsWith("tool-")) {
    const state = part.state;
    if (
      !isSafeMessageId(part.toolCallId) ||
      typeof state !== "string" ||
      ![
        "input-streaming",
        "input-available",
        "approval-requested",
        "approval-responded",
        "output-available",
        "output-error",
        "output-denied",
      ].includes(state)
    ) {
      return null;
    }
  }

  const sanitized = sanitizeCloneableValue(part);
  return sanitized && typeof sanitized === "object"
    ? (sanitized as CompanionConversationPart)
    : null;
}

export function validateCompanionDraft(value: unknown): CompanionDraft {
  if (!value || typeof value !== "object") {
    throw new Error("درخواست دستیار سریع معتبر نیست.");
  }

  const input = value as Partial<CompanionDraft>;
  const text = typeof input.text === "string" ? input.text.trim() : "";
  if (text.length > COMPANION_MAX_PROMPT_LENGTH) {
    throw new Error("متن درخواست بیش از حد طولانی است.");
  }

  let screenshot: CompanionScreenshot | undefined;
  if (input.screenshot !== undefined) {
    const candidate = input.screenshot;
    if (
      !candidate ||
      typeof candidate !== "object" ||
      (candidate.mediaType !== "image/jpeg" &&
        candidate.mediaType !== "image/png") ||
      typeof candidate.base64 !== "string" ||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(candidate.base64) ||
      approximateBase64Bytes(candidate.base64) >
        COMPANION_MAX_SCREENSHOT_BYTES ||
      typeof candidate.width !== "number" ||
      !Number.isInteger(candidate.width) ||
      candidate.width < 1 ||
      candidate.width > 8_192 ||
      typeof candidate.height !== "number" ||
      !Number.isInteger(candidate.height) ||
      candidate.height < 1 ||
      candidate.height > 8_192
    ) {
      throw new Error("تصویر صفحه معتبر نیست.");
    }

    screenshot = {
      name:
        typeof candidate.name === "string" &&
        /^[\w.-]{1,128}$/.test(candidate.name)
          ? candidate.name
          : "screen-capture.jpg",
      mediaType: candidate.mediaType,
      base64: candidate.base64,
      width: candidate.width,
      height: candidate.height,
    };
  }

  if (!text && !screenshot) {
    throw new Error("یک درخواست بنویسید، صحبت کنید یا تصویر صفحه بگیرید.");
  }

  if (input.workspaceId !== undefined && !isSafeId(input.workspaceId)) {
    throw new Error("فضای کاری انتخاب‌شده معتبر نیست.");
  }

  if (input.chatId !== undefined && !isSafeId(input.chatId)) {
    throw new Error("گفتگوی انتخاب‌شده معتبر نیست.");
  }

  if (
    input.model !== undefined &&
    (!input.model ||
      typeof input.model !== "object" ||
      !isSafeId(input.model.providerId) ||
      !isSafeModelId(input.model.modelId))
  ) {
    throw new Error("مدل انتخاب‌شده معتبر نیست.");
  }

  if (input.agentMode !== undefined && !isAgentMode(input.agentMode)) {
    throw new Error("حالت انتخاب‌شده معتبر نیست.");
  }

  return {
    text,
    ...(screenshot ? { screenshot } : {}),
    ...(input.chatId ? { chatId: input.chatId } : {}),
    ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
    ...(input.model ? { model: input.model } : {}),
    ...(input.agentMode ? { agentMode: input.agentMode } : {}),
  };
}

export function validateCompanionConversation(
  value: unknown
): CompanionConversationSnapshot {
  if (!value || typeof value !== "object") {
    throw new Error("گفتگوی دستیار سریع معتبر نیست.");
  }

  const input = value as Partial<CompanionConversationSnapshot>;
  if (
    !isSafeId(input.chatId) ||
    !isSafeId(input.workspaceId) ||
    !["idle", "running", "failed"].includes(input.state ?? "") ||
    !Array.isArray(input.messages)
  ) {
    throw new Error("گفتگوی دستیار سریع معتبر نیست.");
  }

  const messages = input.messages
    .slice(-24)
    .flatMap((message): CompanionConversationMessage[] => {
      if (
        !message ||
        typeof message !== "object" ||
        !isSafeMessageId(message.id) ||
        (message.role !== "user" && message.role !== "assistant") ||
        !Array.isArray(message.parts)
      ) {
        return [];
      }
      const parts = message.parts
        .slice(0, COMPANION_MAX_PARTS_PER_MESSAGE)
        .flatMap((part): CompanionConversationPart[] => {
          const sanitized = sanitizeConversationPart(part);
          return sanitized ? [sanitized] : [];
        });
      if (parts.length === 0) return [];
      const metadata = sanitizeCloneableValue(message.metadata);
      return [
        {
          id: message.id,
          role: message.role,
          parts,
          ...(metadata && typeof metadata === "object"
            ? { metadata: metadata as ChatUIMessage["metadata"] }
            : {}),
        },
      ];
    });

  return {
    chatId: input.chatId,
    workspaceId: input.workspaceId,
    title:
      typeof input.title === "string" && input.title.trim()
        ? input.title.trim().slice(0, 120)
        : "گفتگوی سریع",
    state: input.state as CompanionConversationSnapshot["state"],
    messages,
  };
}

export function validateCompanionStatus(
  value: unknown
): CompanionSubmissionStatus {
  if (!value || typeof value !== "object") {
    throw new Error("وضعیت دستیار سریع معتبر نیست.");
  }
  const input = value as Partial<CompanionSubmissionStatus>;
  if (
    !isSafeId(input.requestId) ||
    !["accepted", "running", "completed", "failed"].includes(
      input.state ?? ""
    )
  ) {
    throw new Error("وضعیت دستیار سریع معتبر نیست.");
  }

  return {
    requestId: input.requestId,
    state: input.state as CompanionSubmissionStatus["state"],
    ...(isSafeId(input.chatId) ? { chatId: input.chatId } : {}),
    ...(isSafeId(input.workspaceId) ? { workspaceId: input.workspaceId } : {}),
    ...(typeof input.message === "string" && input.message.trim()
      ? { message: input.message.trim().slice(0, 500) }
      : {}),
  };
}

export function fitCaptureSize(
  width: number,
  height: number,
  maxWidth = 1_920,
  maxHeight = 1_080
) {
  const safeWidth = Math.max(1, Math.round(width));
  const safeHeight = Math.max(1, Math.round(height));
  const scale = Math.min(maxWidth / safeWidth, maxHeight / safeHeight, 1);
  return {
    width: Math.max(1, Math.round(safeWidth * scale)),
    height: Math.max(1, Math.round(safeHeight * scale)),
  };
}
