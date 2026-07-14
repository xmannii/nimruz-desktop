import { DatabaseSync } from "node:sqlite";
import type {
  LegacyDataSnapshot,
  LegacyImportResult,
} from "@/lib/desktop-api";
import type { LocalChat, LocalProject } from "@/lib/chat/storage";
import {
  DEFAULT_PERSONALIZATION_SETTINGS,
  sanitizePersonalizationSettings,
  type PersonalizationSettings,
} from "@/lib/settings/personalization";
import {
  sanitizeMemories,
  type MemoryEntry,
} from "@/lib/settings/memories";

const LEGACY_MIGRATION_KEY = "legacy-browser-storage-v1";

type CredentialRow = {
  encryptedKey: Buffer;
  hint: string | null;
};

function asNumber(value: unknown): number {
  return typeof value === "bigint" ? Number(value) : Number(value);
}

function asBoolean(value: unknown): boolean {
  return asNumber(value) === 1;
}

function validateId(id: unknown): id is string {
  return typeof id === "string" && /^[\w-]{1,128}$/.test(id);
}

function parseMessages(value: unknown): LocalChat["messages"] {
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export class AppDatabase {
  readonly database: DatabaseSync;
  private transactionDepth = 0;

  constructor(path: string) {
    this.database = new DatabaseSync(path, { timeout: 5_000 });
    this.database.exec("PRAGMA journal_mode = WAL");
    this.database.exec("PRAGMA foreign_keys = ON");
    this.migrate();
  }

  close() {
    this.database.close();
  }

  private migrate() {
    const row = this.database.prepare("PRAGMA user_version").get();
    const currentVersion = asNumber(row?.user_version ?? 0);

    if (currentVersion < 1) {
      this.transaction(() => {
        this.database.exec(`
          CREATE TABLE IF NOT EXISTS projects (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            description TEXT NOT NULL DEFAULT '',
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
          );

          CREATE TABLE IF NOT EXISTS chats (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            model TEXT NOT NULL,
            messages_json TEXT NOT NULL,
            project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            title_is_custom INTEGER NOT NULL DEFAULT 0
          );

          CREATE INDEX IF NOT EXISTS chats_updated_at_idx
            ON chats(updated_at DESC);
          CREATE INDEX IF NOT EXISTS chats_project_id_idx
            ON chats(project_id);
          CREATE INDEX IF NOT EXISTS projects_updated_at_idx
            ON projects(updated_at DESC);

          CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value_json TEXT NOT NULL,
            updated_at INTEGER NOT NULL
          );

          CREATE TABLE IF NOT EXISTS memories (
            id TEXT PRIMARY KEY,
            content TEXT NOT NULL,
            category TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
          );

          CREATE INDEX IF NOT EXISTS memories_updated_at_idx
            ON memories(updated_at DESC);

          CREATE TABLE IF NOT EXISTS credentials (
            provider TEXT PRIMARY KEY,
            encrypted_key BLOB NOT NULL,
            hint TEXT,
            updated_at INTEGER NOT NULL
          );

          CREATE TABLE IF NOT EXISTS metadata (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
          );

          PRAGMA user_version = 1;
        `);
      });
    }
  }

  private transaction<T>(operation: () => T): T {
    if (this.transactionDepth > 0) {
      return operation();
    }

    this.database.exec("BEGIN IMMEDIATE");
    this.transactionDepth += 1;
    try {
      const result = operation();
      this.database.exec("COMMIT");
      return result;
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    } finally {
      this.transactionDepth -= 1;
    }
  }

  loadChats(): LocalChat[] {
    return this.database
      .prepare(
        `SELECT id, title, model, messages_json, project_id, created_at,
                updated_at, title_is_custom
           FROM chats
          ORDER BY updated_at DESC`
      )
      .all()
      .filter((row) => validateId(row.id))
      .map((row) => ({
        id: String(row.id),
        title: String(row.title),
        model: String(row.model) as LocalChat["model"],
        messages: parseMessages(row.messages_json),
        projectId: typeof row.project_id === "string" ? row.project_id : null,
        createdAt: asNumber(row.created_at),
        updatedAt: asNumber(row.updated_at),
        titleIsCustom: asBoolean(row.title_is_custom),
      }));
  }

  saveChats(chats: LocalChat[]): void {
    const statement = this.database.prepare(`
      INSERT INTO chats (
        id, title, model, messages_json, project_id, created_at, updated_at,
        title_is_custom
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        title = excluded.title,
        model = excluded.model,
        messages_json = excluded.messages_json,
        project_id = excluded.project_id,
        created_at = excluded.created_at,
        updated_at = excluded.updated_at,
        title_is_custom = excluded.title_is_custom
    `);

    this.transaction(() => {
      for (const chat of chats) {
        if (!validateId(chat.id) || !Array.isArray(chat.messages)) continue;
        statement.run(
          chat.id,
          String(chat.title),
          String(chat.model),
          JSON.stringify(chat.messages),
          validateId(chat.projectId) ? chat.projectId : null,
          Number(chat.createdAt),
          Number(chat.updatedAt),
          chat.titleIsCustom ? 1 : 0
        );
      }
    });
  }

  deleteChat(id: string): void {
    if (!validateId(id)) throw new Error("Invalid chat id.");
    this.database.prepare("DELETE FROM chats WHERE id = ?").run(id);
  }

  loadProjects(): LocalProject[] {
    return this.database
      .prepare(
        `SELECT id, title, description, created_at, updated_at
           FROM projects
          ORDER BY updated_at DESC`
      )
      .all()
      .filter((row) => validateId(row.id))
      .map((row) => ({
        id: String(row.id),
        title: String(row.title),
        description: String(row.description),
        createdAt: asNumber(row.created_at),
        updatedAt: asNumber(row.updated_at),
      }));
  }

  saveProject(project: LocalProject): void {
    if (!validateId(project.id)) throw new Error("Invalid project id.");
    this.database
      .prepare(
        `INSERT INTO projects (id, title, description, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           title = excluded.title,
           description = excluded.description,
           created_at = excluded.created_at,
           updated_at = excluded.updated_at`
      )
      .run(
        project.id,
        String(project.title),
        String(project.description),
        Number(project.createdAt),
        Number(project.updatedAt)
      );
  }

  deleteProject(id: string): void {
    if (!validateId(id)) throw new Error("Invalid project id.");
    this.database.prepare("DELETE FROM projects WHERE id = ?").run(id);
  }

  loadPersonalization(): PersonalizationSettings {
    const row = this.database
      .prepare("SELECT value_json FROM settings WHERE key = ?")
      .get("personalization");
    if (typeof row?.value_json !== "string") {
      return DEFAULT_PERSONALIZATION_SETTINGS;
    }
    try {
      return sanitizePersonalizationSettings(JSON.parse(row.value_json));
    } catch {
      return DEFAULT_PERSONALIZATION_SETTINGS;
    }
  }

  savePersonalization(value: unknown): PersonalizationSettings {
    const settings = sanitizePersonalizationSettings(value);
    this.database
      .prepare(
        `INSERT INTO settings (key, value_json, updated_at)
         VALUES ('personalization', ?, ?)
         ON CONFLICT(key) DO UPDATE SET
           value_json = excluded.value_json,
           updated_at = excluded.updated_at`
      )
      .run(JSON.stringify(settings), Date.now());
    return settings;
  }

  loadMemories(): MemoryEntry[] {
    return sanitizeMemories(
      this.database
        .prepare(
          `SELECT id, content, category, created_at AS createdAt,
                  updated_at AS updatedAt
             FROM memories
            ORDER BY updated_at DESC`
        )
        .all()
    );
  }

  saveMemories(value: unknown): MemoryEntry[] {
    const memories = sanitizeMemories(value);
    const statement = this.database.prepare(
      `INSERT INTO memories (id, content, category, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`
    );
    this.transaction(() => {
      this.database.exec("DELETE FROM memories");
      for (const memory of memories) {
        statement.run(
          memory.id,
          memory.content,
          memory.category,
          memory.createdAt,
          memory.updatedAt
        );
      }
    });
    return memories;
  }

  getCredential(provider: string): CredentialRow | null {
    const row = this.database
      .prepare(
        `SELECT encrypted_key, hint
           FROM credentials
          WHERE provider = ?`
      )
      .get(provider);
    if (!row || !(row.encrypted_key instanceof Uint8Array)) return null;
    return {
      encryptedKey: Buffer.from(row.encrypted_key),
      hint: typeof row.hint === "string" ? row.hint : null,
    };
  }

  setCredential(provider: string, encryptedKey: Buffer, hint: string): void {
    this.database
      .prepare(
        `INSERT INTO credentials (provider, encrypted_key, hint, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(provider) DO UPDATE SET
           encrypted_key = excluded.encrypted_key,
           hint = excluded.hint,
           updated_at = excluded.updated_at`
      )
      .run(provider, encryptedKey, hint, Date.now());
  }

  clearCredential(provider: string): void {
    this.database
      .prepare("DELETE FROM credentials WHERE provider = ?")
      .run(provider);
  }

  importLegacyData(snapshot: LegacyDataSnapshot): LegacyImportResult {
    const marker = this.database
      .prepare("SELECT value FROM metadata WHERE key = ?")
      .get(LEGACY_MIGRATION_KEY);
    if (marker) {
      return {
        imported: false,
        chats: this.loadChats().length,
        projects: this.loadProjects().length,
        memories: this.loadMemories().length,
      };
    }

    return this.transaction(() => {
      for (const project of snapshot.projects) this.saveProject(project);
      this.saveChats(snapshot.chats);
      this.savePersonalization(snapshot.personalization);
      this.saveMemories(snapshot.memories);
      this.database
        .prepare("INSERT INTO metadata (key, value) VALUES (?, ?)")
        .run(LEGACY_MIGRATION_KEY, new Date().toISOString());

      return {
        imported: true,
        chats: this.loadChats().length,
        projects: this.loadProjects().length,
        memories: this.loadMemories().length,
      };
    });
  }
}
