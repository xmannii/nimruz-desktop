import { nanoid } from "nanoid";

export type Expert = {
  id: string;
  name: string;
  slug: string;
  description: string;
  instructions: string;
  triggers: string[];
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
};

export const EXPERT_LIMITS = {
  maxEntries: 30,
  name: 60,
  slug: 40,
  description: 240,
  instructions: 8_000,
  triggers: 12,
  trigger: 80,
} as const;

export function normalizeExpertSlug(value: unknown): string {
  return typeof value === "string"
    ? value
        .trim()
        .toLowerCase()
        .replace(/^[/@]+/, "")
        .replace(/[^a-z0-9-]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .replace(/-{2,}/g, "-")
        .slice(0, EXPERT_LIMITS.slug)
    : "";
}
function cleanText(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export function sanitizeExpert(value: unknown): Expert | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<Expert>;
  const name = cleanText(candidate.name, EXPERT_LIMITS.name);
  const slug = normalizeExpertSlug(candidate.slug || name);
  const description = cleanText(candidate.description, EXPERT_LIMITS.description);
  const instructions = cleanText(candidate.instructions, EXPERT_LIMITS.instructions);
  if (!name || !slug || !description || !instructions) return null;

  const now = Date.now();
  const triggers = Array.isArray(candidate.triggers)
    ? [...new Set(candidate.triggers.map((item) => cleanText(item, EXPERT_LIMITS.trigger)).filter(Boolean))].slice(0, EXPERT_LIMITS.triggers)
    : [];

  return {
    id: typeof candidate.id === "string" && /^[\w-]{1,128}$/.test(candidate.id)
      ? candidate.id
      : nanoid(),
    name,
    slug,
    description,
    instructions,
    triggers,
    enabled: candidate.enabled !== false,
    createdAt: Number.isFinite(candidate.createdAt) ? Number(candidate.createdAt) : now,
    updatedAt: Number.isFinite(candidate.updatedAt) ? Number(candidate.updatedAt) : now,
  };
}

export function sanitizeExperts(value: unknown): Expert[] {
  if (!Array.isArray(value)) return [];
  const result: Expert[] = [];
  const ids = new Set<string>();
  const slugs = new Set<string>();
  for (const item of value) {
    const expert = sanitizeExpert(item);
    if (!expert || ids.has(expert.id) || slugs.has(expert.slug)) continue;
    ids.add(expert.id);
    slugs.add(expert.slug);
    result.push(expert);
    if (result.length >= EXPERT_LIMITS.maxEntries) break;
  }
  return result.sort((a, b) => b.updatedAt - a.updatedAt);
}

export function upsertExpert(experts: Expert[], value: Partial<Expert>): Expert[] {
  const existing = experts.find((item) => item.id === value.id);
  const expert = sanitizeExpert({
    ...existing,
    ...value,
    id: existing?.id ?? value.id ?? nanoid(),
    createdAt: existing?.createdAt ?? Date.now(),
    updatedAt: Date.now(),
  });
  if (!expert) return experts;
  return sanitizeExperts([expert, ...experts.filter((item) => item.id !== expert.id && item.slug !== expert.slug)]);
}

export function findExplicitExpert(experts: Expert[], text: string): Expert | null {
  const command = text.trim().match(/^[/@]([a-z0-9-]+)(?:\s|$)/i)?.[1]?.toLowerCase();
  return command ? experts.find((item) => item.enabled && item.slug === command) ?? null : null;
}
