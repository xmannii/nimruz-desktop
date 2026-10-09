import type { DatabaseSync } from "node:sqlite";
import {
  STUDIO_ITEM_STATUSES,
  STUDIO_KINDS,
  STUDIO_LIMITS,
  STUDIO_PROVIDERS,
  type StudioItem,
  type StudioItemStatus,
  type StudioKind,
  type StudioListOptions,
  type StudioProvider,
} from "@/lib/studio/types";
import { normalizeSearchText } from "@/lib/studio/search";

/** A row as stored, including the private on-disk media path. */
export type StudioItemRecord = StudioItem & { storagePath: string | null };

export function isStudioItemId(value: unknown): value is string {
  return typeof value === "string" && /^[\w-]{1,128}$/.test(value);
}

function oneOf<T extends string>(
  values: readonly T[],
  value: unknown,
  fallback: T
): T {
  return typeof value === "string" && (values as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

function nullableNumber(value: unknown) {
  if (value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function nullableText(value: unknown) {
  return typeof value === "string" ? value : null;
}

function parseParams(value: unknown): Record<string, unknown> {
  if (typeof value !== "string") return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function mapRow(row: Record<string, unknown>): StudioItemRecord {
  const storagePath = nullableText(row.storage_path);
  const status = oneOf<StudioItemStatus>(STUDIO_ITEM_STATUSES, row.status, "failed");
  return {
    id: String(row.id),
    kind: oneOf<StudioKind>(STUDIO_KINDS, row.kind, "image"),
    status,
    title: String(row.title ?? ""),
    prompt: String(row.prompt ?? ""),
    provider: oneOf<StudioProvider>(STUDIO_PROVIDERS, row.provider, "openrouter"),
    modelId: String(row.model_id ?? ""),
    params: parseParams(row.params_json),
    mimeType: nullableText(row.mime_type),
    hasMedia: Boolean(storagePath),
    storagePath,
    text: nullableText(row.text),
    correctedText: nullableText(row.corrected_text),
    error: nullableText(row.error),
    cost: nullableNumber(row.cost),
    durationSeconds: nullableNumber(row.duration_seconds),
    parentId: nullableText(row.parent_id),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

function searchTextFor(record: StudioItemRecord) {
  return normalizeSearchText(
    [record.title, record.prompt, record.text ?? "", record.correctedText ?? ""].join(" ")
  ).slice(0, 20_000);
}

export function toPublicStudioItem(record: StudioItemRecord): StudioItem {
  const { storagePath: _storagePath, ...item } = record;
  return item;
}

const COLUMNS = `id, kind, status, title, prompt, provider, model_id, params_json,
  mime_type, storage_path, text, corrected_text, error, cost, duration_seconds,
  parent_id, created_at, updated_at`;

export type StudioItemPatch = Partial<
  Pick<
    StudioItemRecord,
    | "status"
    | "title"
    | "params"
    | "mimeType"
    | "storagePath"
    | "text"
    | "correctedText"
    | "error"
    | "cost"
    | "durationSeconds"
  >
>;

/** Persistence for Studio generations, transcripts, and speech clips. */
export class StudioStore {
  constructor(private readonly database: DatabaseSync) {}

  insert(record: StudioItemRecord) {
    if (!isStudioItemId(record.id)) throw new Error("Invalid Studio item id.");
    this.database
      .prepare(
        `INSERT INTO studio_items (${COLUMNS}, search_text)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        record.id,
        record.kind,
        record.status,
        record.title,
        record.prompt,
        record.provider,
        record.modelId,
        JSON.stringify(record.params),
        record.mimeType,
        record.storagePath,
        record.text,
        record.correctedText,
        record.error,
        record.cost,
        record.durationSeconds,
        record.parentId,
        record.createdAt,
        record.updatedAt,
        searchTextFor(record)
      );
    return record;
  }

  get(id: string): StudioItemRecord | null {
    if (!isStudioItemId(id)) return null;
    const row = this.database
      .prepare(`SELECT ${COLUMNS} FROM studio_items WHERE id = ?`)
      .get(id);
    return row ? mapRow(row) : null;
  }

  update(id: string, patch: StudioItemPatch): StudioItemRecord | null {
    const current = this.get(id);
    if (!current) return null;
    const next: StudioItemRecord = {
      ...current,
      ...patch,
      hasMedia: Boolean(patch.storagePath ?? current.storagePath),
      updatedAt: Math.max(Date.now(), current.updatedAt + 1),
    };
    this.database
      .prepare(
        `UPDATE studio_items
            SET status = ?, title = ?, params_json = ?, mime_type = ?,
                storage_path = ?, text = ?, corrected_text = ?, error = ?,
                cost = ?, duration_seconds = ?, search_text = ?, updated_at = ?
          WHERE id = ?`
      )
      .run(
        next.status,
        next.title,
        JSON.stringify(next.params),
        next.mimeType,
        next.storagePath,
        next.text,
        next.correctedText,
        next.error,
        next.cost,
        next.durationSeconds,
        searchTextFor(next),
        next.updatedAt,
        id
      );
    return next;
  }

  list(options: StudioListOptions = {}): StudioItemRecord[] {
    const clauses: string[] = [];
    const values: Array<string | number> = [];
    if (options.kind && (STUDIO_KINDS as readonly string[]).includes(options.kind)) {
      clauses.push("kind = ?");
      values.push(options.kind);
    }
    if (typeof options.before === "number" && Number.isFinite(options.before)) {
      clauses.push("created_at < ?");
      values.push(options.before);
    }
    const query =
      typeof options.query === "string"
        ? normalizeSearchText(options.query.slice(0, 200))
        : "";
    if (query) {
      clauses.push(`search_text LIKE ? ESCAPE '\\'`);
      values.push(`%${query.replace(/[\\%_]/g, (char) => `\\${char}`)}%`);
    }
    const limit = Math.min(
      Math.max(1, Math.trunc(options.limit ?? STUDIO_LIMITS.listPageSize)),
      200
    );
    const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
    return this.database
      .prepare(
        `SELECT ${COLUMNS} FROM studio_items ${where}
          ORDER BY created_at DESC, id DESC LIMIT ?`
      )
      .all(...values, limit)
      .map(mapRow);
  }

  /** Items that were mid-flight when the app last quit. */
  listUnfinished(): StudioItemRecord[] {
    return this.database
      .prepare(
        `SELECT ${COLUMNS} FROM studio_items
          WHERE status IN ('pending', 'running')
          ORDER BY created_at ASC`
      )
      .all()
      .map(mapRow);
  }

  delete(id: string) {
    if (!isStudioItemId(id)) return;
    this.database.prepare("DELETE FROM studio_items WHERE id = ?").run(id);
  }
}
