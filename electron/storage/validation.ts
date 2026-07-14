import { getModelById } from "@/lib/models";
import type { LegacyDataSnapshot } from "@/lib/desktop-api";
import type { LocalChat, LocalProject } from "@/lib/chat/storage";
import { sanitizeMemories } from "@/lib/settings/memories";
import { sanitizePersonalizationSettings } from "@/lib/settings/personalization";

const MAX_IPC_PAYLOAD_BYTES = 25 * 1024 * 1024;

function assertPayloadSize(value: unknown) {
  if (Buffer.byteLength(JSON.stringify(value), "utf8") > MAX_IPC_PAYLOAD_BYTES) {
    throw new Error("Storage payload is too large.");
  }
}

function isId(value: unknown): value is string {
  return typeof value === "string" && /^[\w-]{1,128}$/.test(value);
}

function parseChat(value: unknown): LocalChat | null {
  if (!value || typeof value !== "object") return null;
  const chat = value as Partial<LocalChat>;
  if (
    !isId(chat.id) ||
    typeof chat.title !== "string" ||
    !getModelById(String(chat.model)) ||
    !Array.isArray(chat.messages) ||
    !Number.isFinite(chat.createdAt) ||
    !Number.isFinite(chat.updatedAt)
  ) {
    return null;
  }
  return {
    id: chat.id,
    title: chat.title.slice(0, 500),
    model: chat.model!,
    messages: chat.messages,
    projectId: isId(chat.projectId) ? chat.projectId : null,
    createdAt: Number(chat.createdAt),
    updatedAt: Number(chat.updatedAt),
    titleIsCustom: Boolean(chat.titleIsCustom),
  };
}

export function validateChatsPayload(value: unknown): LocalChat[] {
  if (!Array.isArray(value)) throw new Error("Chats must be an array.");
  assertPayloadSize(value);
  const chats = value.map(parseChat);
  if (chats.some((chat) => chat === null)) {
    throw new Error("One or more chats are invalid.");
  }
  return chats as LocalChat[];
}

export function validateProjectPayload(value: unknown): LocalProject {
  if (!value || typeof value !== "object") {
    throw new Error("Project is invalid.");
  }
  const project = value as Partial<LocalProject>;
  if (
    !isId(project.id) ||
    typeof project.title !== "string" ||
    typeof project.description !== "string" ||
    !Number.isFinite(project.createdAt) ||
    !Number.isFinite(project.updatedAt)
  ) {
    throw new Error("Project is invalid.");
  }
  return {
    id: project.id,
    title: project.title.slice(0, 500),
    description: project.description.slice(0, 10_000),
    createdAt: Number(project.createdAt),
    updatedAt: Number(project.updatedAt),
  };
}

function parseProjects(value: unknown): LocalProject[] {
  if (!Array.isArray(value)) throw new Error("Projects must be an array.");
  return value.map(validateProjectPayload);
}

export function validateLegacySnapshot(value: unknown): LegacyDataSnapshot {
  if (!value || typeof value !== "object") {
    throw new Error("Legacy data snapshot is invalid.");
  }
  assertPayloadSize(value);
  const snapshot = value as Partial<LegacyDataSnapshot>;
  return {
    chats: validateChatsPayload(snapshot.chats ?? []),
    projects: parseProjects(snapshot.projects ?? []),
    personalization: sanitizePersonalizationSettings(snapshot.personalization),
    memories: sanitizeMemories(snapshot.memories),
  };
}
