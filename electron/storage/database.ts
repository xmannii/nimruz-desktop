import { DatabaseSync } from "node:sqlite";
import type {
  LegacyDataSnapshot,
  LegacyImportResult,
} from "@/lib/desktop-api";
import type { LocalChat, LocalProject } from "@/lib/chat/storage";
import {
  createBuiltinOpenRouterModels,
  createBuiltinOpenRouterProvider,
  OPENROUTER_PROVIDER_ID,
  PROVIDER_LIMITS,
  type ModelConfig,
  type ModelCatalogSnapshot,
  type ProviderConfig,
} from "@/lib/models/catalog";
import {
  sanitizeModelConfig,
  sanitizeProviderConfig,
} from "@/lib/models/sanitize";
import {
  DEFAULT_PERSONALIZATION_SETTINGS,
  sanitizePersonalizationSettings,
  type PersonalizationSettings,
} from "@/lib/settings/personalization";
import {
  sanitizeMemories,
  type MemoryEntry,
} from "@/lib/settings/memories";
import { sanitizeExperts, type Expert } from "@/lib/settings/experts";
import {
  DEFAULT_SKILLS_PREFERENCES,
  sanitizeSkillsPreferences,
  type SkillsPreferences,
} from "@/lib/skills/index";
import { DEFAULT_MODEL, DEFAULT_PROVIDER_ID } from "@/lib/models";
import type { Mission, MissionInput, MissionStatus, MissionStepStatus } from "@/lib/missions/types";

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

function validateModelRowId(id: unknown): id is string {
  return typeof id === "string" && /^[\w.:/-]{1,256}$/.test(id);
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

function mapProviderRow(row: Record<string, unknown>): ProviderConfig {
  return {
    id: String(row.id),
    name: String(row.name),
    kind: row.kind === "openrouter" ? "openrouter" : "openai-compatible",
    baseUrl: String(row.base_url),
    enabled: asBoolean(row.enabled),
    includeUsage: asBoolean(row.include_usage),
    isBuiltin: asBoolean(row.is_builtin),
    authRequired: asBoolean(row.auth_required),
    createdAt: asNumber(row.created_at),
    updatedAt: asNumber(row.updated_at),
  };
}

function mapModelRow(row: Record<string, unknown>): ModelConfig {
  return {
    id: String(row.id),
    providerId: String(row.provider_id),
    modelId: String(row.model_id),
    name: String(row.name),
    fullName: String(row.full_name),
    description: String(row.description),
    contextLength: asNumber(row.context_length),
    maxOutput: asNumber(row.max_output),
    inputPricePerM: asNumber(row.input_price_per_m),
    outputPricePerM: asNumber(row.output_price_per_m),
    supportsImages: asBoolean(row.supports_images),
    supportsTools: asBoolean(row.supports_tools),
    supportsReasoningEffort: asBoolean(row.supports_reasoning_effort),
    enabled: asBoolean(row.enabled),
    isDefault: asBoolean(row.is_default),
    source:
      row.source === "builtin" || row.source === "discovered"
        ? row.source
        : "manual",
    createdAt: asNumber(row.created_at),
    updatedAt: asNumber(row.updated_at),
  };
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

    if (currentVersion < 2) {
      this.transaction(() => {
        this.database.exec(`
          CREATE TABLE IF NOT EXISTS providers (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            kind TEXT NOT NULL,
            base_url TEXT NOT NULL,
            enabled INTEGER NOT NULL DEFAULT 1,
            include_usage INTEGER NOT NULL DEFAULT 1,
            is_builtin INTEGER NOT NULL DEFAULT 0,
            auth_required INTEGER NOT NULL DEFAULT 1,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
          );

          CREATE TABLE IF NOT EXISTS provider_models (
            id TEXT PRIMARY KEY,
            provider_id TEXT NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
            model_id TEXT NOT NULL,
            name TEXT NOT NULL,
            full_name TEXT NOT NULL,
            description TEXT NOT NULL DEFAULT '',
            context_length INTEGER NOT NULL DEFAULT 0,
            max_output INTEGER NOT NULL DEFAULT 0,
            input_price_per_m REAL NOT NULL DEFAULT 0,
            output_price_per_m REAL NOT NULL DEFAULT 0,
            supports_images INTEGER NOT NULL DEFAULT 0,
            supports_tools INTEGER NOT NULL DEFAULT 1,
            supports_reasoning_effort INTEGER NOT NULL DEFAULT 0,
            enabled INTEGER NOT NULL DEFAULT 1,
            is_default INTEGER NOT NULL DEFAULT 0,
            source TEXT NOT NULL DEFAULT 'manual',
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            UNIQUE(provider_id, model_id)
          );

          CREATE INDEX IF NOT EXISTS provider_models_provider_id_idx
            ON provider_models(provider_id);
          CREATE INDEX IF NOT EXISTS provider_models_default_idx
            ON provider_models(is_default DESC);

          ALTER TABLE chats ADD COLUMN provider_id TEXT NOT NULL DEFAULT 'openrouter';
        `);

        this.database
          .prepare(
            `UPDATE chats SET provider_id = ? WHERE provider_id IS NULL OR provider_id = ''`
          )
          .run(OPENROUTER_PROVIDER_ID);

        this.seedBuiltinCatalog();
        this.database.exec("PRAGMA user_version = 2");
      });
    } else {
      this.ensureBuiltinCatalog();
    }

    if (currentVersion < 3) {
      this.transaction(() => {
        this.database.exec(`
          CREATE TABLE IF NOT EXISTS missions (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            goal TEXT NOT NULL,
            status TEXT NOT NULL,
            project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
            workspace_path TEXT,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
          );
          CREATE TABLE IF NOT EXISTS mission_steps (
            id TEXT PRIMARY KEY,
            mission_id TEXT NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
            position INTEGER NOT NULL,
            title TEXT NOT NULL,
            description TEXT NOT NULL DEFAULT '',
            status TEXT NOT NULL,
            depends_on_json TEXT NOT NULL DEFAULT '[]',
            error TEXT,
            started_at INTEGER,
            completed_at INTEGER
          );
          CREATE INDEX IF NOT EXISTS missions_updated_at_idx ON missions(updated_at DESC);
          CREATE INDEX IF NOT EXISTS mission_steps_mission_id_idx ON mission_steps(mission_id, position);
          PRAGMA user_version = 3;
        `);
      });
    }
  }

  private seedBuiltinCatalog() {
    const now = Date.now();
    const provider = createBuiltinOpenRouterProvider(now);
    this.insertProviderRow(provider);
    for (const model of createBuiltinOpenRouterModels(now)) {
      this.insertModelRow(model);
    }
  }

  private ensureBuiltinCatalog() {
    const existing = this.getProvider(OPENROUTER_PROVIDER_ID);
    if (!existing) {
      this.transaction(() => this.seedBuiltinCatalog());
      return;
    }

    const now = Date.now();
    for (const model of createBuiltinOpenRouterModels(now)) {
      const row = this.getModelByRowId(model.id);
      if (!row) {
        this.insertModelRow(model);
      }
    }
  }

  private insertProviderRow(provider: ProviderConfig) {
    this.database
      .prepare(
        `INSERT INTO providers (
           id, name, kind, base_url, enabled, include_usage, is_builtin,
           auth_required, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO NOTHING`
      )
      .run(
        provider.id,
        provider.name,
        provider.kind,
        provider.baseUrl,
        provider.enabled ? 1 : 0,
        provider.includeUsage ? 1 : 0,
        provider.isBuiltin ? 1 : 0,
        provider.authRequired ? 1 : 0,
        provider.createdAt,
        provider.updatedAt
      );
  }

  private insertModelRow(model: ModelConfig) {
    this.database
      .prepare(
        `INSERT INTO provider_models (
           id, provider_id, model_id, name, full_name, description,
           context_length, max_output, input_price_per_m, output_price_per_m,
           supports_images, supports_tools, supports_reasoning_effort,
           enabled, is_default, source, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO NOTHING`
      )
      .run(
        model.id,
        model.providerId,
        model.modelId,
        model.name,
        model.fullName,
        model.description,
        model.contextLength,
        model.maxOutput,
        model.inputPricePerM,
        model.outputPricePerM,
        model.supportsImages ? 1 : 0,
        model.supportsTools ? 1 : 0,
        model.supportsReasoningEffort ? 1 : 0,
        model.enabled ? 1 : 0,
        model.isDefault ? 1 : 0,
        model.source,
        model.createdAt,
        model.updatedAt
      );
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
        `SELECT id, title, provider_id, model, messages_json, project_id, created_at,
                updated_at, title_is_custom
           FROM chats
          ORDER BY updated_at DESC`
      )
      .all()
      .filter((row) => validateId(row.id))
      .map((row) => ({
        id: String(row.id),
        title: String(row.title),
        providerId:
          typeof row.provider_id === "string" && row.provider_id
            ? String(row.provider_id)
            : DEFAULT_PROVIDER_ID,
        model: String(row.model),
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
        id, title, provider_id, model, messages_json, project_id, created_at, updated_at,
        title_is_custom
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        title = excluded.title,
        provider_id = excluded.provider_id,
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
          validateId(chat.providerId) ? chat.providerId : DEFAULT_PROVIDER_ID,
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

  loadSkillsPreferences(): SkillsPreferences {
    const row = this.database
      .prepare("SELECT value_json FROM settings WHERE key = ?")
      .get("skills");
    if (typeof row?.value_json !== "string") {
      return { ...DEFAULT_SKILLS_PREFERENCES };
    }
    try {
      return sanitizeSkillsPreferences(JSON.parse(row.value_json));
    } catch {
      return { ...DEFAULT_SKILLS_PREFERENCES };
    }
  }

  saveSkillsPreferences(value: unknown): SkillsPreferences {
    const settings = sanitizeSkillsPreferences(value);
    this.database
      .prepare(
        `INSERT INTO settings (key, value_json, updated_at)
         VALUES ('skills', ?, ?)
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

  loadExperts(): Expert[] {
    const row = this.database
      .prepare("SELECT value_json FROM settings WHERE key = ?")
      .get("experts");
    if (typeof row?.value_json !== "string") return [];
    try {
      return sanitizeExperts(JSON.parse(row.value_json));
    } catch {
      return [];
    }
  }

  saveExperts(value: unknown): Expert[] {
    const experts = sanitizeExperts(value);
    this.database
      .prepare(
        `INSERT INTO settings (key, value_json, updated_at)
         VALUES ('experts', ?, ?)
         ON CONFLICT(key) DO UPDATE SET
           value_json = excluded.value_json,
           updated_at = excluded.updated_at`
      )
      .run(JSON.stringify(experts), Date.now());
    return experts;
  }

  loadMissions(): Mission[] {
    const missions = this.database.prepare(
      `SELECT id, title, goal, status, project_id, workspace_path, created_at, updated_at
         FROM missions ORDER BY updated_at DESC`
    ).all();
    const steps = this.database.prepare(
      `SELECT id, mission_id, position, title, description, status, depends_on_json,
              error, started_at, completed_at
         FROM mission_steps ORDER BY mission_id, position`
    ).all();
    const stepsByMission = new Map<string, Mission["steps"]>();
    for (const row of steps) {
      let dependsOn: string[] = [];
      try { dependsOn = JSON.parse(String(row.depends_on_json)); } catch { /* use empty dependencies */ }
      const step = {
        id: String(row.id), missionId: String(row.mission_id), position: asNumber(row.position),
        title: String(row.title), description: String(row.description),
        status: String(row.status) as MissionStepStatus, dependsOn,
        error: typeof row.error === "string" ? row.error : null,
        startedAt: row.started_at == null ? null : asNumber(row.started_at),
        completedAt: row.completed_at == null ? null : asNumber(row.completed_at),
      };
      const existing = stepsByMission.get(step.missionId) ?? [];
      existing.push(step);
      stepsByMission.set(step.missionId, existing);
    }
    return missions.map((row) => ({
      id: String(row.id), title: String(row.title), goal: String(row.goal),
      status: String(row.status) as MissionStatus,
      projectId: typeof row.project_id === "string" ? row.project_id : null,
      workspacePath: typeof row.workspace_path === "string" ? row.workspace_path : null,
      createdAt: asNumber(row.created_at), updatedAt: asNumber(row.updated_at),
      steps: stepsByMission.get(String(row.id)) ?? [],
    }));
  }

  createMission(mission: Mission): Mission {
    this.transaction(() => {
      this.database.prepare(
        `INSERT INTO missions (id, title, goal, status, project_id, workspace_path, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(mission.id, mission.title, mission.goal, mission.status, mission.projectId, mission.workspacePath, mission.createdAt, mission.updatedAt);
      const statement = this.database.prepare(
        `INSERT INTO mission_steps (id, mission_id, position, title, description, status, depends_on_json, error, started_at, completed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );
      for (const step of mission.steps) statement.run(step.id, step.missionId, step.position, step.title, step.description, step.status, JSON.stringify(step.dependsOn), step.error, step.startedAt, step.completedAt);
    });
    return mission;
  }

  updateMissionStatus(id: string, status: MissionStatus): Mission | null {
    const updatedAt = Date.now();
    this.database.prepare("UPDATE missions SET status = ?, updated_at = ? WHERE id = ?").run(status, updatedAt, id);
    return this.loadMissions().find((mission) => mission.id === id) ?? null;
  }

  replaceMissionSteps(id: string, steps: Mission["steps"]): Mission | null {
    this.transaction(() => {
      this.database.prepare("DELETE FROM mission_steps WHERE mission_id = ?").run(id);
      const statement = this.database.prepare(
        `INSERT INTO mission_steps (id, mission_id, position, title, description, status, depends_on_json, error, started_at, completed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );
      for (const step of steps) statement.run(step.id, id, step.position, step.title, step.description, step.status, JSON.stringify(step.dependsOn), step.error, step.startedAt, step.completedAt);
      this.database.prepare("UPDATE missions SET status = 'planning', updated_at = ? WHERE id = ?").run(Date.now(), id);
    });
    return this.loadMissions().find((mission) => mission.id === id) ?? null;
  }

  deleteMission(id: string): void {
    this.database.prepare("DELETE FROM missions WHERE id = ?").run(id);
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

  loadCatalog(): ModelCatalogSnapshot {
    return {
      providers: this.listProviders(),
      models: this.listModels(),
    };
  }

  listProviders(): ProviderConfig[] {
    return this.database
      .prepare(
        `SELECT id, name, kind, base_url, enabled, include_usage, is_builtin,
                auth_required, created_at, updated_at
           FROM providers
          ORDER BY is_builtin DESC, name COLLATE NOCASE ASC`
      )
      .all()
      .filter((row) => validateId(row.id))
      .map((row) => mapProviderRow(row as Record<string, unknown>));
  }

  getProvider(id: string): ProviderConfig | null {
    if (!validateId(id)) return null;
    const row = this.database
      .prepare(
        `SELECT id, name, kind, base_url, enabled, include_usage, is_builtin,
                auth_required, created_at, updated_at
           FROM providers
          WHERE id = ?`
      )
      .get(id);
    if (!row) return null;
    return mapProviderRow(row as Record<string, unknown>);
  }

  saveProvider(value: unknown): ProviderConfig {
    const existing = this.getProvider(
      value && typeof value === "object" && "id" in value
        ? String((value as { id: unknown }).id)
        : ""
    );
    const provider = sanitizeProviderConfig(value, { existing });

    const count = this.listProviders().length;
    if (!existing && count >= PROVIDER_LIMITS.maxProviders) {
      throw new Error("تعداد ارائه‌دهنده‌ها به حد مجاز رسیده است.");
    }

    this.database
      .prepare(
        `INSERT INTO providers (
           id, name, kind, base_url, enabled, include_usage, is_builtin,
           auth_required, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name,
           kind = excluded.kind,
           base_url = excluded.base_url,
           enabled = excluded.enabled,
           include_usage = excluded.include_usage,
           auth_required = excluded.auth_required,
           updated_at = excluded.updated_at`
      )
      .run(
        provider.id,
        provider.name,
        provider.kind,
        provider.baseUrl,
        provider.enabled ? 1 : 0,
        provider.includeUsage ? 1 : 0,
        provider.isBuiltin ? 1 : 0,
        provider.authRequired ? 1 : 0,
        provider.createdAt,
        provider.updatedAt
      );

    return this.getProvider(provider.id)!;
  }

  deleteProvider(id: string): void {
    if (!validateId(id)) throw new Error("شناسه ارائه‌دهنده نامعتبر است.");
    const provider = this.getProvider(id);
    if (!provider) return;
    if (provider.isBuiltin) {
      throw new Error("ارائه‌دهنده داخلی OpenRouter قابل حذف نیست.");
    }
    this.transaction(() => {
      this.database.prepare("DELETE FROM providers WHERE id = ?").run(id);
      this.clearCredential(id);
      this.ensureDefaultModelExists();
    });
  }

  listModels(providerId?: string): ModelConfig[] {
    if (providerId) {
      if (!validateId(providerId)) return [];
      return this.database
        .prepare(
          `SELECT id, provider_id, model_id, name, full_name, description,
                  context_length, max_output, input_price_per_m, output_price_per_m,
                  supports_images, supports_tools, supports_reasoning_effort,
                  enabled, is_default, source, created_at, updated_at
             FROM provider_models
            WHERE provider_id = ?
            ORDER BY is_default DESC, full_name COLLATE NOCASE ASC`
        )
        .all(providerId)
        .filter((row) => validateModelRowId(row.id))
        .map((row) => mapModelRow(row as Record<string, unknown>));
    }

    return this.database
      .prepare(
        `SELECT id, provider_id, model_id, name, full_name, description,
                context_length, max_output, input_price_per_m, output_price_per_m,
                supports_images, supports_tools, supports_reasoning_effort,
                enabled, is_default, source, created_at, updated_at
           FROM provider_models
          ORDER BY is_default DESC, full_name COLLATE NOCASE ASC`
      )
      .all()
      .filter((row) => validateModelRowId(row.id))
      .map((row) => mapModelRow(row as Record<string, unknown>));
  }

  getModelByRowId(id: string): ModelConfig | null {
    if (!validateModelRowId(id)) return null;
    const row = this.database
      .prepare(
        `SELECT id, provider_id, model_id, name, full_name, description,
                context_length, max_output, input_price_per_m, output_price_per_m,
                supports_images, supports_tools, supports_reasoning_effort,
                enabled, is_default, source, created_at, updated_at
           FROM provider_models
          WHERE id = ?`
      )
      .get(id);
    if (!row) return null;
    return mapModelRow(row as Record<string, unknown>);
  }

  getModelByRef(providerId: string, modelId: string): ModelConfig | null {
    if (!validateId(providerId) || typeof modelId !== "string") return null;
    const row = this.database
      .prepare(
        `SELECT id, provider_id, model_id, name, full_name, description,
                context_length, max_output, input_price_per_m, output_price_per_m,
                supports_images, supports_tools, supports_reasoning_effort,
                enabled, is_default, source, created_at, updated_at
           FROM provider_models
          WHERE provider_id = ? AND model_id = ?`
      )
      .get(providerId, modelId);
    if (!row) return null;
    return mapModelRow(row as Record<string, unknown>);
  }

  saveModel(value: unknown): ModelConfig {
    const rawId =
      value && typeof value === "object" && "id" in value
        ? String((value as { id: unknown }).id)
        : "";
    const existing = this.getModelByRowId(rawId);
    const model = sanitizeModelConfig(value, { existing });

    const provider = this.getProvider(model.providerId);
    if (!provider) {
      throw new Error("ارائه‌دهنده مدل یافت نشد.");
    }

    const providerModels = this.listModels(model.providerId);
    if (
      !existing &&
      !provider.isBuiltin &&
      providerModels.length >= PROVIDER_LIMITS.maxModelsPerProvider
    ) {
      throw new Error("تعداد مدل‌های این ارائه‌دهنده به حد مجاز (۲۰۰) رسیده است.");
    }

    const duplicate = providerModels.find(
      (item) => item.modelId === model.modelId && item.id !== model.id
    );
    if (duplicate) {
      throw new Error("این شناسه مدل قبلاً برای این ارائه‌دهنده ثبت شده است.");
    }

    this.transaction(() => {
      if (model.isDefault) {
        this.database
          .prepare("UPDATE provider_models SET is_default = 0")
          .run();
      }

      this.database
        .prepare(
          `INSERT INTO provider_models (
             id, provider_id, model_id, name, full_name, description,
             context_length, max_output, input_price_per_m, output_price_per_m,
             supports_images, supports_tools, supports_reasoning_effort,
             enabled, is_default, source, created_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             provider_id = excluded.provider_id,
             model_id = excluded.model_id,
             name = excluded.name,
             full_name = excluded.full_name,
             description = excluded.description,
             context_length = excluded.context_length,
             max_output = excluded.max_output,
             input_price_per_m = excluded.input_price_per_m,
             output_price_per_m = excluded.output_price_per_m,
             supports_images = excluded.supports_images,
             supports_tools = excluded.supports_tools,
             supports_reasoning_effort = excluded.supports_reasoning_effort,
             enabled = excluded.enabled,
             is_default = excluded.is_default,
             source = excluded.source,
             updated_at = excluded.updated_at`
        )
        .run(
          model.id,
          model.providerId,
          model.modelId,
          model.name,
          model.fullName,
          model.description,
          model.contextLength,
          model.maxOutput,
          model.inputPricePerM,
          model.outputPricePerM,
          model.supportsImages ? 1 : 0,
          model.supportsTools ? 1 : 0,
          model.supportsReasoningEffort ? 1 : 0,
          model.enabled ? 1 : 0,
          model.isDefault ? 1 : 0,
          model.source,
          model.createdAt,
          model.updatedAt
        );

      this.ensureDefaultModelExists();
    });

    return this.getModelByRowId(model.id)!;
  }

  deleteModel(id: string): void {
    const model = this.getModelByRowId(id);
    if (!model) return;
    if (model.source === "builtin") {
      throw new Error("مدل‌های داخلی OpenRouter قابل حذف نیستند.");
    }
    this.transaction(() => {
      this.database.prepare("DELETE FROM provider_models WHERE id = ?").run(id);
      this.ensureDefaultModelExists();
    });
  }

  deleteProviderModels(providerId: string): number {
    if (!validateId(providerId)) {
      throw new Error("شناسه ارائه‌دهنده نامعتبر است.");
    }
    const provider = this.getProvider(providerId);
    if (!provider) {
      throw new Error("ارائه‌دهنده یافت نشد.");
    }

    const deletable = this.listModels(providerId).filter(
      (model) => model.source !== "builtin"
    );
    if (deletable.length === 0) return 0;

    this.transaction(() => {
      this.database
        .prepare(
          `DELETE FROM provider_models
            WHERE provider_id = ? AND source != 'builtin'`
        )
        .run(providerId);
      this.ensureDefaultModelExists();
    });

    return deletable.length;
  }

  setDefaultModel(id: string): ModelConfig {
    const model = this.getModelByRowId(id);
    if (!model) throw new Error("مدل یافت نشد.");
    if (!model.enabled) {
      throw new Error("مدل پیش‌فرض باید فعال باشد.");
    }

    this.transaction(() => {
      this.database.prepare("UPDATE provider_models SET is_default = 0").run();
      this.database
        .prepare(
          `UPDATE provider_models
              SET is_default = 1, updated_at = ?
            WHERE id = ?`
        )
        .run(Date.now(), id);
    });

    return this.getModelByRowId(id)!;
  }

  private ensureDefaultModelExists() {
    const models = this.listModels();
    const enabled = models.filter((model) => model.enabled);
    if (enabled.length === 0) return;

    const hasDefault = enabled.some((model) => model.isDefault);
    if (hasDefault) return;

    const fallback =
      enabled.find((model) => model.modelId === DEFAULT_MODEL) ?? enabled[0];
    this.database
      .prepare(
        `UPDATE provider_models
            SET is_default = 1, updated_at = ?
          WHERE id = ?`
      )
      .run(Date.now(), fallback.id);
  }

  resolveChatModel(
    providerId?: string | null,
    modelId?: string | null
  ): { provider: ProviderConfig; model: ModelConfig } | null {
    if (providerId && modelId) {
      const provider = this.getProvider(providerId);
      const model = this.getModelByRef(providerId, modelId);
      if (provider?.enabled && model?.enabled) {
        return { provider, model };
      }
    }

    const models = this.listModels();
    const providers = new Map(
      this.listProviders()
        .filter((provider) => provider.enabled)
        .map((provider) => [provider.id, provider] as const)
    );

    const preferred =
      models.find((model) => model.isDefault && model.enabled) ??
      models.find(
        (model) =>
          model.enabled &&
          model.modelId === DEFAULT_MODEL &&
          providers.has(model.providerId)
      ) ??
      models.find((model) => model.enabled && providers.has(model.providerId));

    if (!preferred) return null;
    const provider = providers.get(preferred.providerId);
    if (!provider) return null;
    return { provider, model: preferred };
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
