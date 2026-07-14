import { nanoid } from "nanoid";

export const MEMORY_CATEGORIES = [
  "preference",
  "fact",
  "context",
  "goal",
] as const;

export type MemoryCategory = (typeof MEMORY_CATEGORIES)[number];

export type MemoryEntry = {
  id: string;
  content: string;
  category: MemoryCategory;
  createdAt: number;
  updatedAt: number;
};

export const MEMORY_CATEGORY_LABELS: Record<MemoryCategory, string> = {
  preference: "ترجیح",
  fact: "واقعیت",
  context: "زمینه",
  goal: "هدف",
};

export const MEMORY_LIMITS = {
  maxEntries: 40,
  content: 300,
} as const;

const CATEGORY_SET = new Set<string>(MEMORY_CATEGORIES);

function cleanContent(value: unknown) {
  return typeof value === "string"
    ? value.trim().slice(0, MEMORY_LIMITS.content)
    : "";
}

export function sanitizeMemoryEntry(value: unknown): MemoryEntry | null {
  if (!value || typeof value !== "object") return null;

  const entry = value as Record<string, unknown>;
  const content = cleanContent(entry.content);
  if (!content) return null;

  const category =
    typeof entry.category === "string" && CATEGORY_SET.has(entry.category)
      ? (entry.category as MemoryCategory)
      : "fact";

  const createdAt =
    typeof entry.createdAt === "number" && Number.isFinite(entry.createdAt)
      ? entry.createdAt
      : Date.now();
  const updatedAt =
    typeof entry.updatedAt === "number" && Number.isFinite(entry.updatedAt)
      ? entry.updatedAt
      : createdAt;

  return {
    id: typeof entry.id === "string" && entry.id ? entry.id : nanoid(),
    content,
    category,
    createdAt,
    updatedAt,
  };
}

export function sanitizeMemories(value: unknown): MemoryEntry[] {
  if (!Array.isArray(value)) return [];

  const seen = new Set<string>();
  const memories: MemoryEntry[] = [];

  for (const item of value) {
    const entry = sanitizeMemoryEntry(item);
    if (!entry || seen.has(entry.content)) continue;
    seen.add(entry.content);
    memories.push(entry);
    if (memories.length >= MEMORY_LIMITS.maxEntries) break;
  }

  return memories.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function loadMemories(): Promise<MemoryEntry[]> {
  return window.desktop.storage.loadMemories();
}

export async function saveMemories(
  memories: MemoryEntry[]
): Promise<MemoryEntry[]> {
  const sanitized = sanitizeMemories(memories);
  return window.desktop.storage.saveMemories(sanitized);
}

export function addMemory(
  memories: MemoryEntry[],
  input: { content: string; category?: MemoryCategory }
) {
  const content = cleanContent(input.content);
  if (!content) {
    return { memories, entry: null as MemoryEntry | null, error: "empty" as const };
  }

  const existing = memories.find(
    (memory) => memory.content.toLowerCase() === content.toLowerCase()
  );
  if (existing) {
    return { memories, entry: existing, error: null };
  }

  if (memories.length >= MEMORY_LIMITS.maxEntries) {
    return { memories, entry: null, error: "limit" as const };
  }

  const now = Date.now();
  const entry: MemoryEntry = {
    id: nanoid(),
    content,
    category:
      input.category && CATEGORY_SET.has(input.category)
        ? input.category
        : "fact",
    createdAt: now,
    updatedAt: now,
  };

  return {
    memories: sanitizeMemories([entry, ...memories]),
    entry,
    error: null,
  };
}

export function deleteMemory(memories: MemoryEntry[], id: string) {
  return sanitizeMemories(memories.filter((memory) => memory.id !== id));
}

export function buildMemoriesAppendix(value: unknown) {
  const memories = sanitizeMemories(value);
  if (!memories.length) return "";

  const lines = memories.map(
    (memory) => `- id: ${memory.id} | [${memory.category}] ${memory.content}`
  );

  return [
    "## Long-term memory",
    "The following facts were saved from earlier conversations. Use them when relevant to personalize answers. Do not mention the memory system unless the user asks about it.",
    lines.join("\n"),
  ].join("\n\n");
}
