/**
 * Pure helpers for Telegram inbound attachments and outbound artifact delivery.
 * Keeps media shaping out of the agent runtime (same dialect as desktop chat).
 */

import path from "node:path";
import type { ChatUIMessage, MessageAttachment } from "@/lib/chat/message";
import { classifyFile, type FileCategory } from "@/lib/workspace";
import type { TelegramMessage } from "./api";

/** Bot API getFile download ceiling. */
export const TELEGRAM_INBOUND_MAX_BYTES = 20 * 1024 * 1024;
/** Conservative cap for outbound sendDocument multipart uploads. */
export const TELEGRAM_OUTBOUND_MAX_BYTES = 20 * 1024 * 1024;

const VISION_IMAGE_EXTS = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".gif",
]);

export type TelegramInboundMedia = {
  fileId: string;
  fileName: string;
  mimeType: string;
  fileSize: number | null;
  caption: string;
  category: FileCategory;
  isImage: boolean;
};

export type ArtifactDeliverable = {
  id: string;
  title: string;
  kind: string;
  path: string;
  sizeBytes: number | null;
};

export type BuiltTelegramUserContent = {
  parts: ChatUIMessage["parts"];
  metadata?: { attachments: MessageAttachment[] };
  titleSeed: string;
  textForLimits: string;
};

/** Pick the largest photo size or a document attachment from a Telegram message. */
export function extractTelegramInboundMedia(
  message: TelegramMessage
): TelegramInboundMedia | null {
  const caption =
    typeof message.caption === "string" ? message.caption.trim() : "";

  if (message.document) {
    const doc = message.document;
    const fileName =
      (typeof doc.file_name === "string" && doc.file_name.trim()) ||
      "document.bin";
    const mimeType =
      (typeof doc.mime_type === "string" && doc.mime_type.trim()) ||
      guessMimeFromName(fileName);
    const category = classifyFile(fileName);
    return {
      fileId: doc.file_id,
      fileName,
      mimeType,
      fileSize: typeof doc.file_size === "number" ? doc.file_size : null,
      caption,
      category,
      isImage:
        category === "image" ||
        mimeType.startsWith("image/") ||
        VISION_IMAGE_EXTS.has(path.extname(fileName).toLowerCase()),
    };
  }

  if (message.photo && message.photo.length > 0) {
    const best = [...message.photo].sort((a, b) => {
      const areaA = (a.width ?? 0) * (a.height ?? 0);
      const areaB = (b.width ?? 0) * (b.height ?? 0);
      if (areaB !== areaA) return areaB - areaA;
      return (b.file_size ?? 0) - (a.file_size ?? 0);
    })[0];
    if (!best) return null;
    return {
      fileId: best.file_id,
      fileName: "photo.jpg",
      mimeType: "image/jpeg",
      fileSize: typeof best.file_size === "number" ? best.file_size : null,
      caption,
      category: "image",
      isImage: true,
    };
  }

  return null;
}

export function validateTelegramInboundMedia(
  media: TelegramInboundMedia,
  options: { supportsImages: boolean }
): { ok: true } | { ok: false; reason: string } {
  if (
    media.fileSize != null &&
    media.fileSize > TELEGRAM_INBOUND_MAX_BYTES
  ) {
    return {
      ok: false,
      reason:
        "حجم این فایل برای دریافت از تلگرام بیش از حد زیاد است (حداکثر ۲۰ مگابایت).",
    };
  }

  if (media.isImage) {
    if (!options.supportsImages) {
      return {
        ok: false,
        reason:
          "مدل فعال از تصویر پشتیبانی نمی‌کند. یک مدل vision انتخاب کنید یا توضیح متنی بفرستید.",
      };
    }
    const ext = path.extname(media.fileName).toLowerCase() || ".jpg";
    if (!VISION_IMAGE_EXTS.has(ext) && !media.mimeType.startsWith("image/")) {
      return {
        ok: false,
        reason: "این نوع تصویر پشتیبانی نمی‌شود (jpeg، png، webp، gif).",
      };
    }
    return { ok: true };
  }

  // Documents: PDF (extractable) + text-like categories the agent can read.
  if (media.category === "binary") {
    const ext = path.extname(media.fileName).toLowerCase();
    if (ext === ".pdf" || media.mimeType === "application/pdf") {
      return { ok: true };
    }
    return {
      ok: false,
      reason:
        "این نوع فایل پشتیبانی نمی‌شود. PDF یا فایل‌های متنی/کد (مثل md، txt، json، csv، ts) را بفرستید.",
    };
  }

  return { ok: true };
}

/**
 * Build a user message matching desktop chat-session attachment rules:
 * vision images → file parts; everything else → @path text references.
 */
export function buildTelegramUserContent(options: {
  caption: string;
  imported: Array<{
    name: string;
    relativePath: string;
    mimeType: string;
    category: FileCategory;
    base64?: string;
  }>;
  supportsImages: boolean;
}): BuiltTelegramUserContent {
  const caption = options.caption.trim();
  const usable = options.imported;
  const imageAttachments = usable.filter(
    (item) =>
      options.supportsImages &&
      (item.category === "image" || item.mimeType.startsWith("image/")) &&
      item.base64
  );
  const referenced = usable.filter(
    (item) =>
      !(
        options.supportsImages &&
        (item.category === "image" || item.mimeType.startsWith("image/")) &&
        item.base64
      )
  );

  const references = referenced.map((item) => `@${item.relativePath}`);
  const defaultPrompt =
    usable.length === 1
      ? `این فایل را بررسی کن: ${usable[0]!.name}`
      : "این فایل‌ها را بررسی کن.";
  const body = caption || (references.length ? defaultPrompt : "");
  const finalText = references.length
    ? [body, references.join(" ")].filter(Boolean).join("\n\n")
    : body;

  const files = imageAttachments.map((item) => ({
    type: "file" as const,
    mediaType: item.mimeType,
    url: `data:${item.mimeType};base64,${item.base64}`,
    filename: item.name,
  }));

  const attachmentMeta: MessageAttachment[] = referenced.map((item) => ({
    name: item.name,
    relativePath: item.relativePath,
    mediaType: item.mimeType,
    category: item.category,
  }));

  const parts: ChatUIMessage["parts"] = [
    ...files,
    ...(finalText ? [{ type: "text" as const, text: finalText }] : []),
  ];

  return {
    parts,
    metadata: attachmentMeta.length
      ? { attachments: attachmentMeta }
      : undefined,
    titleSeed: caption || usable[0]?.name || "فایل تلگرام",
    textForLimits: finalText,
  };
}

/** Collect successful create_artifact tool results from an assistant message. */
export function collectArtifactDeliverables(
  message: ChatUIMessage | undefined
): ArtifactDeliverable[] {
  if (!message) return [];
  const found: ArtifactDeliverable[] = [];
  const seen = new Set<string>();

  for (const part of message.parts) {
    if (part.type !== "tool-create_artifact") continue;
    if (!("state" in part) || part.state !== "output-available") continue;
    const output =
      "output" in part
        ? (part as { output?: unknown }).output
        : undefined;
    if (!output || typeof output !== "object") continue;
    const record = output as Record<string, unknown>;
    const id = typeof record.id === "string" ? record.id : null;
    const title = typeof record.title === "string" ? record.title : null;
    const kind = typeof record.kind === "string" ? record.kind : "other";
    const storagePath =
      typeof record.path === "string" ? record.path : null;
    if (!id || !title || !storagePath || seen.has(id)) continue;
    seen.add(id);
    found.push({
      id,
      title,
      kind,
      path: storagePath,
      sizeBytes:
        typeof record.sizeBytes === "number" &&
        Number.isFinite(record.sizeBytes)
          ? record.sizeBytes
          : null,
    });
  }
  return found;
}

export function telegramDocumentFilename(
  title: string,
  storagePath: string
): string {
  const ext = path.extname(storagePath) || ".txt";
  const base =
    title
      .replace(/[/\\?%*:|"<>]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 80) || "artifact";
  const withExt = base.toLowerCase().endsWith(ext.toLowerCase())
    ? base
    : `${base}${ext}`;
  return withExt;
}

function guessMimeFromName(fileName: string): string {
  const ext = path.extname(fileName).toLowerCase();
  switch (ext) {
    case ".pdf":
      return "application/pdf";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".webp":
      return "image/webp";
    case ".gif":
      return "image/gif";
    case ".md":
    case ".markdown":
      return "text/markdown";
    case ".json":
      return "application/json";
    case ".csv":
      return "text/csv";
    case ".html":
    case ".htm":
      return "text/html";
    case ".svg":
      return "image/svg+xml";
    case ".txt":
      return "text/plain";
    default:
      return "application/octet-stream";
  }
}
