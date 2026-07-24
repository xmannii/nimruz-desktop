import { getModelById } from "@/lib/models";
import type { LegacyDataSnapshot } from "@/lib/desktop-api";
import { sanitizeAgentMode } from "@/lib/chat/agent-mode";
import {
  sanitizeMcpServerIds,
  type LocalChat,
} from "@/lib/chat/storage";
import { sanitizeMemories } from "@/lib/settings/memories";
import { sanitizePersonalizationSettings } from "@/lib/settings/personalization";
import { DEFAULT_PROVIDER_ID } from "@/lib/models";
import { isValidModelSlug } from "@/lib/models/sanitize";
import {
  sanitizeModelConfig,
  sanitizeProviderConfig,
  normalizeBaseUrl,
} from "@/lib/models/sanitize";
import type { ModelConfig, ProviderConfig } from "@/lib/models/catalog";
import {
  sanitizeWorkspace,
  type LocalWorkspace,
  type PlanRecord,
} from "@/lib/workspace";

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
  const chat = value as Partial<LocalChat> & { projectId?: string | null };
  const model = String(chat.model ?? "");
  const providerId = isId(chat.providerId)
    ? chat.providerId
    : DEFAULT_PROVIDER_ID;

  const modelOk =
    Boolean(getModelById(model)) || isValidModelSlug(model);

  if (
    !isId(chat.id) ||
    typeof chat.title !== "string" ||
    !modelOk ||
    !Array.isArray(chat.messages) ||
    !Number.isFinite(chat.createdAt) ||
    !Number.isFinite(chat.updatedAt)
  ) {
    return null;
  }

  const workspaceId = isId(chat.workspaceId)
    ? chat.workspaceId
    : isId(chat.projectId)
      ? chat.projectId
      : null;

  return {
    id: chat.id,
    title: chat.title.slice(0, 500),
    providerId,
    model,
    messages: chat.messages,
    workspaceId,
    mcpServerIds: sanitizeMcpServerIds(chat.mcpServerIds),
    agentMode: sanitizeAgentMode(chat.agentMode),
    createdAt: Number(chat.createdAt),
    updatedAt: Number(chat.updatedAt),
    titleIsCustom: Boolean(chat.titleIsCustom),
    pinned: Boolean(chat.pinned),
    pinnedAt:
      chat.pinnedAt == null || !Number.isFinite(chat.pinnedAt)
        ? null
        : Number(chat.pinnedAt),
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

export function validateWorkspacePayload(value: unknown): LocalWorkspace {
  assertPayloadSize(value);
  return sanitizeWorkspace(value);
}

export function validatePlanPayload(value: unknown): PlanRecord {
  assertPayloadSize(value);
  if (!value || typeof value !== "object") {
    throw new Error("Plan payload is invalid.");
  }
  const plan = value as Partial<PlanRecord>;
  if (
    !isId(plan.id) ||
    !isId(plan.workspaceId) ||
    (plan.runId != null && !isId(plan.runId)) ||
    (plan.chatId != null && !isId(plan.chatId)) ||
    typeof plan.title !== "string" ||
    !plan.title.trim() ||
    plan.title.length > 200 ||
    typeof plan.markdown !== "string" ||
    plan.markdown.length > 100_000 ||
    !Array.isArray(plan.steps) ||
    plan.steps.length > 100 ||
    !["draft", "active", "completed", "cancelled"].includes(
      String(plan.status)
    ) ||
    !Number.isFinite(plan.createdAt) ||
    !Number.isFinite(plan.updatedAt)
  ) {
    throw new Error("Plan payload is invalid.");
  }
  const steps = plan.steps.map((value) => {
    if (!value || typeof value !== "object") {
      throw new Error("Plan step is invalid.");
    }
    const step = value as PlanRecord["steps"][number];
    if (
      !isId(step.id) ||
      typeof step.title !== "string" ||
      !step.title.trim() ||
      step.title.length > 200 ||
      typeof step.description !== "string" ||
      step.description.length > 2_000 ||
      !["pending", "in_progress", "completed", "blocked"].includes(
        String(step.status)
      )
    ) {
      throw new Error("Plan step is invalid.");
    }
    return {
      id: step.id,
      title: step.title.trim(),
      description: step.description.trim(),
      status: step.status,
    };
  });
  return {
    id: plan.id,
    workspaceId: plan.workspaceId,
    runId: plan.runId ?? null,
    chatId: plan.chatId ?? null,
    title: plan.title.trim(),
    markdown: plan.markdown,
    steps,
    status: plan.status as PlanRecord["status"],
    createdAt: Number(plan.createdAt),
    updatedAt: Number(plan.updatedAt),
  };
}

/** @deprecated Use validateWorkspacePayload */
export function validateProjectPayload(value: unknown): LocalWorkspace {
  return validateWorkspacePayload(value);
}

function parseWorkspaces(value: unknown): LocalWorkspace[] {
  if (!Array.isArray(value)) throw new Error("Workspaces must be an array.");
  return value.map(validateWorkspacePayload);
}

export function validateLegacySnapshot(value: unknown): LegacyDataSnapshot {
  if (!value || typeof value !== "object") {
    throw new Error("Legacy data snapshot is invalid.");
  }
  assertPayloadSize(value);
  const snapshot = value as Partial<LegacyDataSnapshot>;
  return {
    chats: validateChatsPayload(snapshot.chats ?? []),
    projects: parseWorkspaces(snapshot.projects ?? []),
    personalization: sanitizePersonalizationSettings(snapshot.personalization),
    memories: sanitizeMemories(snapshot.memories),
  };
}

export function validateProviderPayload(
  value: unknown,
  existing?: ProviderConfig | null
): ProviderConfig {
  assertPayloadSize(value);
  return sanitizeProviderConfig(value, { existing });
}

export function validateModelPayload(
  value: unknown,
  existing?: ModelConfig | null
): ModelConfig {
  assertPayloadSize(value);
  return sanitizeModelConfig(value, { existing });
}

export { normalizeBaseUrl };
