import { isAgentMode, type AgentMode } from "@/lib/chat/agent-mode";
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
};

export type CompanionConversationPart =
  | {
      type: "text";
      text: string;
    }
  | {
      type: "reasoning";
      text: string;
      state: "running" | "completed";
    }
  | {
      type: "tool";
      toolName: string;
      state: "running" | "completed" | "failed" | "approval";
      subject?: string;
    };

export type CompanionConversationSnapshot = {
  chatId: string;
  workspaceId: string;
  title: string;
  state: "idle" | "running" | "failed";
  messages: CompanionConversationMessage[];
};

export type CompanionActivityItem = {
  chatId: string;
  workspaceId: string;
  title: string;
  prompt: string;
};

export type CompanionActivitySnapshot = {
  items: CompanionActivityItem[];
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
        .slice(0, 40)
        .flatMap((part): CompanionConversationPart[] => {
          if (!part || typeof part !== "object" || !("type" in part)) {
            return [];
          }
          if (
            part.type === "text" &&
            "text" in part &&
            typeof part.text === "string" &&
            part.text.trim()
          ) {
            return [{ type: "text", text: part.text.trim().slice(0, 8_000) }];
          }
          if (
            part.type === "reasoning" &&
            "text" in part &&
            typeof part.text === "string" &&
            "state" in part &&
            (part.state === "running" || part.state === "completed")
          ) {
            return [
              {
                type: "reasoning",
                text: part.text.trim().slice(0, 4_000),
                state: part.state,
              },
            ];
          }
          if (
            part.type === "tool" &&
            "toolName" in part &&
            typeof part.toolName === "string" &&
            /^[\w-]{1,100}$/.test(part.toolName) &&
            "state" in part &&
            ["running", "completed", "failed", "approval"].includes(
              String(part.state)
            )
          ) {
            return [
              {
                type: "tool",
                toolName: part.toolName,
                state: part.state as Extract<
                  CompanionConversationPart,
                  { type: "tool" }
                >["state"],
                ...("subject" in part &&
                typeof part.subject === "string" &&
                part.subject.trim()
                  ? { subject: part.subject.trim().slice(0, 180) }
                  : {}),
              },
            ];
          }
          return [];
        });
      if (parts.length === 0) return [];
      return [
        {
          id: message.id,
          role: message.role,
          parts,
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

export function validateCompanionActivity(
  value: unknown
): CompanionActivitySnapshot {
  const input =
    value && typeof value === "object"
      ? (value as Partial<CompanionActivitySnapshot>)
      : {};
  if (!Array.isArray(input.items)) {
    throw new Error("فعالیت‌های دستیار سریع معتبر نیستند.");
  }

  return {
    items: input.items.slice(0, 6).flatMap((item): CompanionActivityItem[] => {
      if (
        !item ||
        typeof item !== "object" ||
        !isSafeId(item.chatId) ||
        !isSafeId(item.workspaceId)
      ) {
        return [];
      }
      return [
        {
          chatId: item.chatId,
          workspaceId: item.workspaceId,
          title:
            typeof item.title === "string" && item.title.trim()
              ? item.title.trim().slice(0, 120)
              : "گفتگوی در حال اجرا",
          prompt:
            typeof item.prompt === "string"
              ? item.prompt.trim().slice(0, 240)
              : "",
        },
      ];
    }),
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
