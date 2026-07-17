import { nanoid } from "nanoid";

export type SubagentModel = {
  id: string;
  providerId: string;
  modelId: string;
  description: string;
  enabled: boolean;
};

export const SUBAGENT_MODEL_LIMITS = {
  maxEntries: 12,
  providerId: 128,
  modelId: 256,
  description: 500,
} as const;

function cleanText(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

export function sanitizeSubagentModel(value: unknown): SubagentModel | null {
  if (!value || typeof value !== "object") return null;

  const candidate = value as Partial<SubagentModel>;
  const providerId = cleanText(
    candidate.providerId,
    SUBAGENT_MODEL_LIMITS.providerId
  );
  const modelId = cleanText(candidate.modelId, SUBAGENT_MODEL_LIMITS.modelId);
  if (!providerId || !modelId) return null;

  return {
    id:
      typeof candidate.id === "string" &&
      /^[\w-]{1,128}$/.test(candidate.id)
        ? candidate.id
        : nanoid(),
    providerId,
    modelId,
    description: cleanText(
      candidate.description,
      SUBAGENT_MODEL_LIMITS.description
    ),
    enabled: candidate.enabled !== false,
  };
}

export function sanitizeSubagentModels(value: unknown): SubagentModel[] {
  if (!Array.isArray(value)) return [];

  const result: SubagentModel[] = [];
  const ids = new Set<string>();
  const modelRefs = new Set<string>();

  for (const item of value) {
    const model = sanitizeSubagentModel(item);
    if (!model) continue;

    const ref = `${model.providerId}\0${model.modelId}`;
    if (ids.has(model.id) || modelRefs.has(ref)) continue;

    ids.add(model.id);
    modelRefs.add(ref);
    result.push(model);
    if (result.length >= SUBAGENT_MODEL_LIMITS.maxEntries) break;
  }

  return result;
}

export async function loadSubagentModels(): Promise<SubagentModel[]> {
  return window.desktop.storage.loadSubagents();
}

export async function saveSubagentModels(
  models: SubagentModel[]
): Promise<SubagentModel[]> {
  return window.desktop.storage.saveSubagents(sanitizeSubagentModels(models));
}
