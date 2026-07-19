import { DatabaseSync } from "node:sqlite";
import type {
  LegacyDataSnapshot,
  LegacyImportResult,
} from "@/lib/desktop-api";
import {
  DEFAULT_AGENT_MODE,
  sanitizeAgentMode,
  type AgentMode,
} from "@/lib/chat/agent-mode";
import type { LocalChat } from "@/lib/chat/storage";
import type { CodexChatThread, CodexModelDescriptor } from "@/lib/codex";
import {
  CODEX_PROVIDER_ID,
  createBuiltinCodexProvider,
  createBuiltinOpenRouterModels,
  createBuiltinOpenRouterProvider,
  createCodexModelConfig,
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
  DEFAULT_APPEARANCE_SETTINGS,
  sanitizeAppearanceSettings,
  type AppearanceSettings,
} from "@/lib/settings/appearance";
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
  sanitizeSubagentModels,
  type SubagentModel,
} from "@/lib/settings/subagents";
import {
  DEFAULT_SKILLS_PREFERENCES,
  sanitizeSkillsPreferences,
  type SkillsPreferences,
} from "@/lib/skills/index";
import { DEFAULT_MODEL, DEFAULT_PROVIDER_ID } from "@/lib/models";
import {
  createHomeWorkspace,
  DEFAULT_WORKSPACE_TRUST,
  HOME_WORKSPACE_ID,
  normalizeWorkspaceTrust,
  sanitizeWorkspace,
  sanitizeWorkspaceRoot,
  type AgentRun,
  type AgentRunStep,
  type ApprovalRecord,
  type ArtifactRecord,
  type LocalWorkspace,
  type PlanRecord,
  type PlanStatus,
  type TaskRecord,
  type ToolCallRecord,
  type WorkspaceRoot,
} from "@/lib/workspace";

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

function validateCodexThreadId(id: unknown): id is string {
  return (
    typeof id === "string" &&
    id.length > 0 &&
    id.length <= 256 &&
    !/[\u0000-\u001f]/.test(id)
  );
}

function hasTableColumn(
  database: DatabaseSync,
  table: string,
  column: string
) {
  return database
    .prepare(`PRAGMA table_info(${table})`)
    .all()
    .some((row) => row.name === column);
}

function hasTable(database: DatabaseSync, table: string) {
  return Boolean(
    database
      .prepare(
        "SELECT 1 AS found FROM sqlite_master WHERE type = 'table' AND name = ?"
      )
      .get(table)
  );
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
    kind:
      row.kind === "openrouter" || row.kind === "codex"
        ? row.kind
        : "openai-compatible",
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
    }

    // Schema versions 3 and 4 were assigned independently on the official,
    // Codex, and agentic-workspace branches. Migrate by inspecting physical
    // tables and columns, then converge every known lineage on version 6.
    if (currentVersion < 6) {
      this.transaction(() => {
        if (!hasTableColumn(this.database, "chats", "pinned")) {
          this.database.exec(
            "ALTER TABLE chats ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0"
          );
        }
        if (!hasTableColumn(this.database, "chats", "pinned_at")) {
          this.database.exec("ALTER TABLE chats ADD COLUMN pinned_at INTEGER");
        }

        if (
          !hasTable(this.database, "workspaces") &&
          hasTable(this.database, "projects")
        ) {
          this.database.exec("ALTER TABLE projects RENAME TO workspaces");
        }
        if (!hasTableColumn(this.database, "workspaces", "instructions")) {
          this.database.exec(
            "ALTER TABLE workspaces ADD COLUMN instructions TEXT NOT NULL DEFAULT ''"
          );
        }
        if (!hasTableColumn(this.database, "workspaces", "trust_json")) {
          this.database.exec(
            "ALTER TABLE workspaces ADD COLUMN trust_json TEXT NOT NULL DEFAULT '{}'"
          );
        }

        if (
          hasTableColumn(this.database, "chats", "project_id") &&
          !hasTableColumn(this.database, "chats", "workspace_id")
        ) {
          this.database.exec(
            "ALTER TABLE chats RENAME COLUMN project_id TO workspace_id"
          );
        }

        this.database.exec(`
          DROP INDEX IF EXISTS chats_project_id_idx;
          CREATE INDEX IF NOT EXISTS chats_workspace_id_idx
            ON chats(workspace_id);
          DROP INDEX IF EXISTS projects_updated_at_idx;
          CREATE INDEX IF NOT EXISTS workspaces_updated_at_idx
            ON workspaces(updated_at DESC);

          CREATE TABLE IF NOT EXISTS workspace_roots (
            id TEXT PRIMARY KEY,
            workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
            kind TEXT NOT NULL,
            path TEXT NOT NULL,
            label TEXT NOT NULL DEFAULT '',
            is_primary INTEGER NOT NULL DEFAULT 0,
            created_at INTEGER NOT NULL
          );
          CREATE INDEX IF NOT EXISTS workspace_roots_workspace_id_idx
            ON workspace_roots(workspace_id);

          CREATE TABLE IF NOT EXISTS agent_runs (
            id TEXT PRIMARY KEY,
            workspace_id TEXT REFERENCES workspaces(id) ON DELETE SET NULL,
            chat_id TEXT NOT NULL,
            status TEXT NOT NULL,
            model TEXT NOT NULL,
            provider_id TEXT NOT NULL,
            error TEXT,
            step_count INTEGER NOT NULL DEFAULT 0,
            started_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            finished_at INTEGER
          );
          CREATE INDEX IF NOT EXISTS agent_runs_chat_id_idx
            ON agent_runs(chat_id);
          CREATE INDEX IF NOT EXISTS agent_runs_workspace_id_idx
            ON agent_runs(workspace_id);
          CREATE INDEX IF NOT EXISTS agent_runs_updated_at_idx
            ON agent_runs(updated_at DESC);

          CREATE TABLE IF NOT EXISTS agent_run_steps (
            id TEXT PRIMARY KEY,
            run_id TEXT NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
            step_index INTEGER NOT NULL,
            kind TEXT NOT NULL,
            summary TEXT NOT NULL,
            detail_json TEXT,
            created_at INTEGER NOT NULL
          );
          CREATE INDEX IF NOT EXISTS agent_run_steps_run_id_idx
            ON agent_run_steps(run_id);

          CREATE TABLE IF NOT EXISTS tool_calls (
            id TEXT PRIMARY KEY,
            run_id TEXT NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
            tool_name TEXT NOT NULL,
            risk TEXT NOT NULL,
            input_json TEXT NOT NULL,
            output_json TEXT,
            status TEXT NOT NULL,
            error TEXT,
            started_at INTEGER NOT NULL,
            finished_at INTEGER
          );
          CREATE INDEX IF NOT EXISTS tool_calls_run_id_idx
            ON tool_calls(run_id);

          CREATE TABLE IF NOT EXISTS approvals (
            id TEXT PRIMARY KEY,
            run_id TEXT NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
            tool_call_id TEXT NOT NULL,
            tool_name TEXT NOT NULL,
            risk TEXT NOT NULL,
            reason TEXT NOT NULL DEFAULT '',
            decision TEXT NOT NULL,
            decided_at INTEGER,
            created_at INTEGER NOT NULL
          );
          CREATE INDEX IF NOT EXISTS approvals_run_id_idx
            ON approvals(run_id);

          CREATE TABLE IF NOT EXISTS artifacts (
            id TEXT PRIMARY KEY,
            workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
            run_id TEXT REFERENCES agent_runs(id) ON DELETE SET NULL,
            chat_id TEXT,
            title TEXT NOT NULL,
            kind TEXT NOT NULL,
            mime_type TEXT NOT NULL,
            storage_path TEXT NOT NULL,
            size_bytes INTEGER NOT NULL DEFAULT 0,
            content_hash TEXT,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
          );
          CREATE INDEX IF NOT EXISTS artifacts_workspace_id_idx
            ON artifacts(workspace_id);

          CREATE TABLE IF NOT EXISTS tasks (
            id TEXT PRIMARY KEY,
            workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
            run_id TEXT REFERENCES agent_runs(id) ON DELETE SET NULL,
            chat_id TEXT,
            title TEXT NOT NULL,
            description TEXT NOT NULL DEFAULT '',
            status TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
          );
          CREATE INDEX IF NOT EXISTS tasks_workspace_id_idx
            ON tasks(workspace_id);

          CREATE TABLE IF NOT EXISTS codex_chat_threads (
            chat_id TEXT PRIMARY KEY,
            thread_id TEXT NOT NULL,
            last_user_message_id TEXT,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
          );

          CREATE UNIQUE INDEX IF NOT EXISTS codex_chat_threads_thread_id_idx
            ON codex_chat_threads(thread_id);
        `);

        if (!hasTableColumn(this.database, "workspace_roots", "is_primary")) {
          this.database.exec(
            "ALTER TABLE workspace_roots ADD COLUMN is_primary INTEGER NOT NULL DEFAULT 0"
          );
        }

        this.database.exec("PRAGMA user_version = 6");
      });
    }

    if (currentVersion < 7) {
      this.transaction(() => {
        if (!hasTableColumn(this.database, "chats", "agent_mode")) {
          this.database.exec(
            "ALTER TABLE chats ADD COLUMN agent_mode TEXT NOT NULL DEFAULT 'general'"
          );
        }

        this.database.exec(`
          CREATE TABLE IF NOT EXISTS plans (
            id TEXT PRIMARY KEY,
            workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
            run_id TEXT REFERENCES agent_runs(id) ON DELETE SET NULL,
            chat_id TEXT,
            title TEXT NOT NULL,
            markdown TEXT NOT NULL DEFAULT '',
            status TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
          );
          CREATE INDEX IF NOT EXISTS plans_workspace_id_idx
            ON plans(workspace_id);
          CREATE INDEX IF NOT EXISTS plans_workspace_updated_idx
            ON plans(workspace_id, updated_at DESC);
        `);

        this.database.exec("PRAGMA user_version = 7");
      });
    }

    if (currentVersion >= 2) {
      this.ensureBuiltinCatalog();
    }

    this.ensureHomeWorkspace();
  }

  /** Ensures the built-in Home workspace always exists. */
  ensureHomeWorkspace(): LocalWorkspace {
    const existing = this.getWorkspace(HOME_WORKSPACE_ID);
    if (existing) return existing;
    const home = createHomeWorkspace();
    this.saveWorkspace(home);
    return home;
  }

  private seedBuiltinCatalog() {
    const now = Date.now();
    const provider = createBuiltinOpenRouterProvider(now);
    this.insertProviderRow(provider);
    this.insertProviderRow(createBuiltinCodexProvider(now + 1));
    for (const model of createBuiltinOpenRouterModels(now)) {
      this.insertModelRow(model);
    }
  }

  private ensureBuiltinCatalog() {
    const now = Date.now();
    if (!this.getProvider(OPENROUTER_PROVIDER_ID)) {
      this.insertProviderRow(createBuiltinOpenRouterProvider(now));
    }
    if (!this.getProvider(CODEX_PROVIDER_ID)) {
      this.insertProviderRow(createBuiltinCodexProvider(now + 1));
    }
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
        `SELECT id, title, provider_id, model, messages_json, workspace_id, agent_mode,
                created_at, updated_at, title_is_custom, pinned, pinned_at
           FROM chats
          ORDER BY pinned DESC, COALESCE(pinned_at, updated_at) DESC, updated_at DESC`
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
        workspaceId:
          typeof row.workspace_id === "string" ? row.workspace_id : null,
        agentMode: sanitizeAgentMode(row.agent_mode) as AgentMode,
        createdAt: asNumber(row.created_at),
        updatedAt: asNumber(row.updated_at),
        titleIsCustom: asBoolean(row.title_is_custom),
        pinned: asBoolean(row.pinned),
        pinnedAt:
          row.pinned_at == null ? null : asNumber(row.pinned_at),
      }));
  }

  saveChats(chats: LocalChat[]): void {
    const statement = this.database.prepare(`
      INSERT INTO chats (
        id, title, provider_id, model, messages_json, workspace_id, agent_mode,
        created_at, updated_at, title_is_custom, pinned, pinned_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        title = excluded.title,
        provider_id = excluded.provider_id,
        model = excluded.model,
        messages_json = excluded.messages_json,
        workspace_id = excluded.workspace_id,
        agent_mode = excluded.agent_mode,
        created_at = excluded.created_at,
        updated_at = excluded.updated_at,
        title_is_custom = excluded.title_is_custom,
        pinned = excluded.pinned,
        pinned_at = excluded.pinned_at
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
          validateId(chat.workspaceId) ? chat.workspaceId : null,
          sanitizeAgentMode(chat.agentMode ?? DEFAULT_AGENT_MODE),
          Number(chat.createdAt),
          Number(chat.updatedAt),
          chat.titleIsCustom ? 1 : 0,
          chat.pinned ? 1 : 0,
          chat.pinned ? Number(chat.pinnedAt ?? chat.updatedAt) : null
        );
      }
    });
  }

  deleteChat(id: string): void {
    if (!validateId(id)) throw new Error("Invalid chat id.");
    this.transaction(() => {
      this.database
        .prepare("DELETE FROM codex_chat_threads WHERE chat_id = ?")
        .run(id);
      this.database.prepare("DELETE FROM chats WHERE id = ?").run(id);
    });
  }

  deleteAllChats(): void {
    this.transaction(() => {
      this.database.prepare("DELETE FROM codex_chat_threads").run();
      this.database.prepare("DELETE FROM chats").run();
    });
  }

  loadWorkspaces(): LocalWorkspace[] {
    return this.database
      .prepare(
        `SELECT id, title, description, instructions, trust_json, created_at, updated_at
           FROM workspaces
          ORDER BY updated_at DESC`
      )
      .all()
      .filter((row) => validateId(row.id))
      .map((row) =>
        sanitizeWorkspace({
          id: String(row.id),
          title: String(row.title),
          description: String(row.description ?? ""),
          instructions: String(row.instructions ?? ""),
          trust: (() => {
            try {
              return typeof row.trust_json === "string"
                ? JSON.parse(row.trust_json)
                : DEFAULT_WORKSPACE_TRUST;
            } catch {
              return DEFAULT_WORKSPACE_TRUST;
            }
          })(),
          createdAt: asNumber(row.created_at),
          updatedAt: asNumber(row.updated_at),
        })
      );
  }

  /** @deprecated Use loadWorkspaces */
  loadProjects(): LocalWorkspace[] {
    return this.loadWorkspaces();
  }

  saveWorkspace(workspace: LocalWorkspace): void {
    const sanitized = sanitizeWorkspace(workspace);
    this.database
      .prepare(
        `INSERT INTO workspaces (
           id, title, description, instructions, trust_json, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           title = excluded.title,
           description = excluded.description,
           instructions = excluded.instructions,
           trust_json = excluded.trust_json,
           created_at = excluded.created_at,
           updated_at = excluded.updated_at`
      )
      .run(
        sanitized.id,
        sanitized.title,
        sanitized.description,
        sanitized.instructions,
        JSON.stringify(normalizeWorkspaceTrust(sanitized.trust)),
        sanitized.createdAt,
        sanitized.updatedAt
      );
  }

  /** @deprecated Use saveWorkspace */
  saveProject(project: LocalWorkspace): void {
    this.saveWorkspace(project);
  }

  deleteWorkspace(id: string): void {
    if (!validateId(id)) throw new Error("Invalid workspace id.");
    if (id === HOME_WORKSPACE_ID) {
      throw new Error("Cannot delete the Home workspace.");
    }
    this.database.prepare("DELETE FROM workspaces WHERE id = ?").run(id);
  }

  /** @deprecated Use deleteWorkspace */
  deleteProject(id: string): void {
    this.deleteWorkspace(id);
  }

  getWorkspace(id: string): LocalWorkspace | null {
    if (!validateId(id)) return null;
    return this.loadWorkspaces().find((workspace) => workspace.id === id) ?? null;
  }

  loadWorkspaceRoots(workspaceId?: string): WorkspaceRoot[] {
    const rows = workspaceId
      ? this.database
          .prepare(
            `SELECT id, workspace_id, kind, path, label, is_primary, created_at
               FROM workspace_roots
              WHERE workspace_id = ?
              ORDER BY created_at ASC`
          )
          .all(workspaceId)
      : this.database
          .prepare(
            `SELECT id, workspace_id, kind, path, label, is_primary, created_at
               FROM workspace_roots
              ORDER BY created_at ASC`
          )
          .all();

    return rows
      .filter((row) => validateId(row.id))
      .map((row) =>
        sanitizeWorkspaceRoot({
          id: String(row.id),
          workspaceId: String(row.workspace_id),
          kind: row.kind === "linked" ? "linked" : "managed",
          path: String(row.path),
          label: String(row.label ?? ""),
          isPrimary: asNumber(row.is_primary) === 1,
          createdAt: asNumber(row.created_at),
        })
      );
  }

  saveWorkspaceRoot(root: WorkspaceRoot): void {
    const sanitized = sanitizeWorkspaceRoot(root);
    this.database
      .prepare(
        `INSERT INTO workspace_roots (
           id, workspace_id, kind, path, label, is_primary, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           workspace_id = excluded.workspace_id,
           kind = excluded.kind,
           path = excluded.path,
           label = excluded.label,
           is_primary = excluded.is_primary,
           created_at = excluded.created_at`
      )
      .run(
        sanitized.id,
        sanitized.workspaceId,
        sanitized.kind,
        sanitized.path,
        sanitized.label,
        sanitized.isPrimary ? 1 : 0,
        sanitized.createdAt
      );
  }

  /**
   * Mark a single root as the workspace's primary working root, clearing the
   * flag on all other roots in the same workspace. Returns the updated roots.
   */
  setPrimaryWorkspaceRoot(
    workspaceId: string,
    rootId: string
  ): WorkspaceRoot[] {
    if (!validateId(workspaceId) || !validateId(rootId)) {
      throw new Error("Invalid workspace root id.");
    }
    this.transaction(() => {
      this.database
        .prepare(
          `UPDATE workspace_roots SET is_primary = 0 WHERE workspace_id = ?`
        )
        .run(workspaceId);
      this.database
        .prepare(
          `UPDATE workspace_roots SET is_primary = 1
             WHERE id = ? AND workspace_id = ?`
        )
        .run(rootId, workspaceId);
    });
    return this.loadWorkspaceRoots(workspaceId);
  }

  deleteWorkspaceRoot(id: string): void {
    if (!validateId(id)) throw new Error("Invalid workspace root id.");
    this.database.prepare("DELETE FROM workspace_roots WHERE id = ?").run(id);
  }

  saveAgentRun(run: AgentRun): void {
    if (!validateId(run.id)) throw new Error("Invalid run id.");
    this.database
      .prepare(
        `INSERT INTO agent_runs (
           id, workspace_id, chat_id, status, model, provider_id, error,
           step_count, started_at, updated_at, finished_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           workspace_id = excluded.workspace_id,
           chat_id = excluded.chat_id,
           status = excluded.status,
           model = excluded.model,
           provider_id = excluded.provider_id,
           error = excluded.error,
           step_count = excluded.step_count,
           started_at = excluded.started_at,
           updated_at = excluded.updated_at,
           finished_at = excluded.finished_at`
      )
      .run(
        run.id,
        validateId(run.workspaceId) ? run.workspaceId : null,
        String(run.chatId),
        run.status,
        String(run.model),
        String(run.providerId),
        run.error,
        Number(run.stepCount),
        Number(run.startedAt),
        Number(run.updatedAt),
        run.finishedAt == null ? null : Number(run.finishedAt)
      );
  }

  getAgentRun(id: string): AgentRun | null {
    if (!validateId(id)) return null;
    const row = this.database
      .prepare(
        `SELECT id, workspace_id, chat_id, status, model, provider_id, error,
                step_count, started_at, updated_at, finished_at
           FROM agent_runs
          WHERE id = ?`
      )
      .get(id);
    if (!row) return null;
    return {
      id: String(row.id),
      workspaceId:
        typeof row.workspace_id === "string" ? row.workspace_id : null,
      chatId: String(row.chat_id),
      status: row.status as AgentRun["status"],
      model: String(row.model),
      providerId: String(row.provider_id),
      error: typeof row.error === "string" ? row.error : null,
      stepCount: asNumber(row.step_count),
      startedAt: asNumber(row.started_at),
      updatedAt: asNumber(row.updated_at),
      finishedAt: row.finished_at == null ? null : asNumber(row.finished_at),
    };
  }

  listAgentRuns(options?: {
    workspaceId?: string;
    chatId?: string;
    limit?: number;
  }): AgentRun[] {
    const limit = Math.min(Math.max(options?.limit ?? 50, 1), 200);
    let sql = `SELECT id, workspace_id, chat_id, status, model, provider_id, error,
                      step_count, started_at, updated_at, finished_at
                 FROM agent_runs`;
    const params: Array<string | number> = [];
    const clauses: string[] = [];

    if (options?.workspaceId && validateId(options.workspaceId)) {
      clauses.push("workspace_id = ?");
      params.push(options.workspaceId);
    }
    if (options?.chatId && validateId(options.chatId)) {
      clauses.push("chat_id = ?");
      params.push(options.chatId);
    }
    if (clauses.length > 0) {
      sql += ` WHERE ${clauses.join(" AND ")}`;
    }
    sql += " ORDER BY updated_at DESC LIMIT ?";
    params.push(limit);

    return this.database
      .prepare(sql)
      .all(...params)
      .filter((row) => validateId(row.id))
      .map((row) => ({
        id: String(row.id),
        workspaceId:
          typeof row.workspace_id === "string" ? row.workspace_id : null,
        chatId: String(row.chat_id),
        status: row.status as AgentRun["status"],
        model: String(row.model),
        providerId: String(row.provider_id),
        error: typeof row.error === "string" ? row.error : null,
        stepCount: asNumber(row.step_count),
        startedAt: asNumber(row.started_at),
        updatedAt: asNumber(row.updated_at),
        finishedAt:
          row.finished_at == null ? null : asNumber(row.finished_at),
      }));
  }

  addAgentRunStep(step: AgentRunStep): void {
    if (!validateId(step.id) || !validateId(step.runId)) {
      throw new Error("Invalid run step.");
    }
    this.database
      .prepare(
        `INSERT INTO agent_run_steps (
           id, run_id, step_index, kind, summary, detail_json, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        step.id,
        step.runId,
        Number(step.stepIndex),
        step.kind,
        String(step.summary).slice(0, 2_000),
        step.detailJson,
        Number(step.createdAt)
      );
  }

  listAgentRunSteps(runId: string): AgentRunStep[] {
    if (!validateId(runId)) return [];
    return this.database
      .prepare(
        `SELECT id, run_id, step_index, kind, summary, detail_json, created_at
           FROM agent_run_steps
          WHERE run_id = ?
          ORDER BY step_index ASC, created_at ASC`
      )
      .all(runId)
      .map((row) => ({
        id: String(row.id),
        runId: String(row.run_id),
        stepIndex: asNumber(row.step_index),
        kind: row.kind as AgentRunStep["kind"],
        summary: String(row.summary),
        detailJson:
          typeof row.detail_json === "string" ? row.detail_json : null,
        createdAt: asNumber(row.created_at),
      }));
  }

  saveToolCall(call: ToolCallRecord): void {
    if (!validateId(call.id) || !validateId(call.runId)) {
      throw new Error("Invalid tool call.");
    }
    this.database
      .prepare(
        `INSERT INTO tool_calls (
           id, run_id, tool_name, risk, input_json, output_json, status,
           error, started_at, finished_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           output_json = excluded.output_json,
           status = excluded.status,
           error = excluded.error,
           finished_at = excluded.finished_at`
      )
      .run(
        call.id,
        call.runId,
        call.toolName,
        call.risk,
        call.inputJson,
        call.outputJson,
        call.status,
        call.error,
        call.startedAt,
        call.finishedAt
      );
  }

  listToolCalls(runId: string): ToolCallRecord[] {
    if (!validateId(runId)) return [];
    return this.database
      .prepare(
        `SELECT id, run_id, tool_name, risk, input_json, output_json, status,
                error, started_at, finished_at
           FROM tool_calls
          WHERE run_id = ?
          ORDER BY started_at ASC`
      )
      .all(runId)
      .map((row) => ({
        id: String(row.id),
        runId: String(row.run_id),
        toolName: String(row.tool_name),
        risk: row.risk as ToolCallRecord["risk"],
        inputJson: String(row.input_json),
        outputJson:
          typeof row.output_json === "string" ? row.output_json : null,
        status: row.status as ToolCallRecord["status"],
        error: typeof row.error === "string" ? row.error : null,
        startedAt: asNumber(row.started_at),
        finishedAt:
          row.finished_at == null ? null : asNumber(row.finished_at),
      }));
  }

  saveApproval(approval: ApprovalRecord): void {
    if (!validateId(approval.id) || !validateId(approval.runId)) {
      throw new Error("Invalid approval.");
    }
    this.database
      .prepare(
        `INSERT INTO approvals (
           id, run_id, tool_call_id, tool_name, risk, reason, decision,
           decided_at, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           decision = excluded.decision,
           decided_at = excluded.decided_at`
      )
      .run(
        approval.id,
        approval.runId,
        approval.toolCallId,
        approval.toolName,
        approval.risk,
        approval.reason,
        approval.decision,
        approval.decidedAt,
        approval.createdAt
      );
  }

  listApprovals(runId: string): ApprovalRecord[] {
    if (!validateId(runId)) return [];
    return this.database
      .prepare(
        `SELECT id, run_id, tool_call_id, tool_name, risk, reason, decision,
                decided_at, created_at
           FROM approvals
          WHERE run_id = ?
          ORDER BY created_at ASC`
      )
      .all(runId)
      .map((row) => ({
        id: String(row.id),
        runId: String(row.run_id),
        toolCallId: String(row.tool_call_id),
        toolName: String(row.tool_name),
        risk: row.risk as ApprovalRecord["risk"],
        reason: String(row.reason ?? ""),
        decision: row.decision as ApprovalRecord["decision"],
        decidedAt: row.decided_at == null ? null : asNumber(row.decided_at),
        createdAt: asNumber(row.created_at),
      }));
  }

  saveArtifact(artifact: ArtifactRecord): void {
    if (!validateId(artifact.id) || !validateId(artifact.workspaceId)) {
      throw new Error("Invalid artifact.");
    }
    this.database
      .prepare(
        `INSERT INTO artifacts (
           id, workspace_id, run_id, chat_id, title, kind, mime_type,
           storage_path, size_bytes, content_hash, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           title = excluded.title,
           kind = excluded.kind,
           mime_type = excluded.mime_type,
           storage_path = excluded.storage_path,
           size_bytes = excluded.size_bytes,
           content_hash = excluded.content_hash,
           updated_at = excluded.updated_at`
      )
      .run(
        artifact.id,
        artifact.workspaceId,
        validateId(artifact.runId) ? artifact.runId : null,
        artifact.chatId,
        artifact.title,
        artifact.kind,
        artifact.mimeType,
        artifact.storagePath,
        artifact.sizeBytes,
        artifact.contentHash,
        artifact.createdAt,
        artifact.updatedAt
      );
  }

  listArtifacts(workspaceId: string): ArtifactRecord[] {
    if (!validateId(workspaceId)) return [];
    return this.database
      .prepare(
        `SELECT id, workspace_id, run_id, chat_id, title, kind, mime_type,
                storage_path, size_bytes, content_hash, created_at, updated_at
           FROM artifacts
          WHERE workspace_id = ?
          ORDER BY updated_at DESC`
      )
      .all(workspaceId)
      .map((row) => ({
        id: String(row.id),
        workspaceId: String(row.workspace_id),
        runId: typeof row.run_id === "string" ? row.run_id : null,
        chatId: typeof row.chat_id === "string" ? row.chat_id : null,
        title: String(row.title),
        kind: row.kind as ArtifactRecord["kind"],
        mimeType: String(row.mime_type),
        storagePath: String(row.storage_path),
        sizeBytes: asNumber(row.size_bytes),
        contentHash:
          typeof row.content_hash === "string" ? row.content_hash : null,
        createdAt: asNumber(row.created_at),
        updatedAt: asNumber(row.updated_at),
      }));
  }

  deleteArtifact(id: string): void {
    if (!validateId(id)) throw new Error("Invalid artifact id.");
    this.database.prepare("DELETE FROM artifacts WHERE id = ?").run(id);
  }

  getArtifactWorkspaceId(id: string): string | null {
    if (!validateId(id)) return null;
    const row = this.database
      .prepare("SELECT workspace_id FROM artifacts WHERE id = ?")
      .get(id);
    return typeof row?.workspace_id === "string" ? row.workspace_id : null;
  }

  saveTask(task: TaskRecord): void {
    if (!validateId(task.id) || !validateId(task.workspaceId)) {
      throw new Error("Invalid task.");
    }
    this.database
      .prepare(
        `INSERT INTO tasks (
           id, workspace_id, run_id, chat_id, title, description, status,
           created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           title = excluded.title,
           description = excluded.description,
           status = excluded.status,
           run_id = excluded.run_id,
           chat_id = excluded.chat_id,
           updated_at = excluded.updated_at`
      )
      .run(
        task.id,
        task.workspaceId,
        validateId(task.runId) ? task.runId : null,
        task.chatId,
        task.title,
        task.description,
        task.status,
        task.createdAt,
        task.updatedAt
      );
  }

  listTasks(workspaceId: string): TaskRecord[] {
    if (!validateId(workspaceId)) return [];
    return this.database
      .prepare(
        `SELECT id, workspace_id, run_id, chat_id, title, description, status,
                created_at, updated_at
           FROM tasks
          WHERE workspace_id = ?
          ORDER BY updated_at DESC`
      )
      .all(workspaceId)
      .map((row) => ({
        id: String(row.id),
        workspaceId: String(row.workspace_id),
        runId: typeof row.run_id === "string" ? row.run_id : null,
        chatId: typeof row.chat_id === "string" ? row.chat_id : null,
        title: String(row.title),
        description: String(row.description ?? ""),
        status: row.status as TaskRecord["status"],
        createdAt: asNumber(row.created_at),
        updatedAt: asNumber(row.updated_at),
      }));
  }

  deleteTask(id: string): void {
    if (!validateId(id)) throw new Error("Invalid task id.");
    this.database.prepare("DELETE FROM tasks WHERE id = ?").run(id);
  }

  getTaskWorkspaceId(id: string): string | null {
    if (!validateId(id)) return null;
    const row = this.database
      .prepare("SELECT workspace_id FROM tasks WHERE id = ?")
      .get(id);
    return typeof row?.workspace_id === "string" ? row.workspace_id : null;
  }

  savePlan(plan: PlanRecord): void {
    if (!validateId(plan.id) || !validateId(plan.workspaceId)) {
      throw new Error("Invalid plan.");
    }
    this.database
      .prepare(
        `INSERT INTO plans (
           id, workspace_id, run_id, chat_id, title, markdown, status,
           created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           title = excluded.title,
           markdown = excluded.markdown,
           status = excluded.status,
           run_id = excluded.run_id,
           chat_id = excluded.chat_id,
           updated_at = excluded.updated_at`
      )
      .run(
        plan.id,
        plan.workspaceId,
        validateId(plan.runId) ? plan.runId : null,
        plan.chatId,
        plan.title,
        plan.markdown,
        plan.status,
        plan.createdAt,
        plan.updatedAt
      );
  }

  listPlans(workspaceId: string): PlanRecord[] {
    if (!validateId(workspaceId)) return [];
    return this.database
      .prepare(
        `SELECT id, workspace_id, run_id, chat_id, title, markdown, status,
                created_at, updated_at
           FROM plans
          WHERE workspace_id = ?
          ORDER BY updated_at DESC`
      )
      .all(workspaceId)
      .map((row) => ({
        id: String(row.id),
        workspaceId: String(row.workspace_id),
        runId: typeof row.run_id === "string" ? row.run_id : null,
        chatId: typeof row.chat_id === "string" ? row.chat_id : null,
        title: String(row.title),
        markdown: String(row.markdown ?? ""),
        status: row.status as PlanStatus,
        createdAt: asNumber(row.created_at),
        updatedAt: asNumber(row.updated_at),
      }));
  }

  getPlan(id: string): PlanRecord | null {
    if (!validateId(id)) return null;
    const row = this.database
      .prepare(
        `SELECT id, workspace_id, run_id, chat_id, title, markdown, status,
                created_at, updated_at
           FROM plans
          WHERE id = ?`
      )
      .get(id);
    if (!row) return null;
    return {
      id: String(row.id),
      workspaceId: String(row.workspace_id),
      runId: typeof row.run_id === "string" ? row.run_id : null,
      chatId: typeof row.chat_id === "string" ? row.chat_id : null,
      title: String(row.title),
      markdown: String(row.markdown ?? ""),
      status: row.status as PlanStatus,
      createdAt: asNumber(row.created_at),
      updatedAt: asNumber(row.updated_at),
    };
  }

  deletePlan(id: string): void {
    if (!validateId(id)) throw new Error("Invalid plan id.");
    this.database.prepare("DELETE FROM plans WHERE id = ?").run(id);
  }

  getPlanWorkspaceId(id: string): string | null {
    if (!validateId(id)) return null;
    const row = this.database
      .prepare("SELECT workspace_id FROM plans WHERE id = ?")
      .get(id);
    return typeof row?.workspace_id === "string" ? row.workspace_id : null;
  }

  /** Marks every active plan in the workspace completed except `exceptPlanId`. */
  completeActivePlans(workspaceId: string, exceptPlanId?: string): void {
    if (!validateId(workspaceId)) return;
    const now = Date.now();
    if (exceptPlanId && validateId(exceptPlanId)) {
      this.database
        .prepare(
          `UPDATE plans
              SET status = 'completed', updated_at = ?
            WHERE workspace_id = ?
              AND status = 'active'
              AND id != ?`
        )
        .run(now, workspaceId, exceptPlanId);
      return;
    }
    this.database
      .prepare(
        `UPDATE plans
            SET status = 'completed', updated_at = ?
          WHERE workspace_id = ?
            AND status = 'active'`
      )
      .run(now, workspaceId);
  }

  loadOnboardingCompleted(): boolean {
    const row = this.database
      .prepare("SELECT value_json FROM settings WHERE key = ?")
      .get("onboarding-completed");
    if (typeof row?.value_json !== "string") return false;
    try {
      return JSON.parse(row.value_json) === true;
    } catch {
      return false;
    }
  }

  saveOnboardingCompleted(completed: boolean): void {
    this.database
      .prepare(
        `INSERT INTO settings (key, value_json, updated_at)
         VALUES ('onboarding-completed', ?, ?)
         ON CONFLICT(key) DO UPDATE SET
           value_json = excluded.value_json,
           updated_at = excluded.updated_at`
      )
      .run(JSON.stringify(completed), Date.now());
  }

  loadLastSeenVersion(): string | null {
    const row = this.database
      .prepare("SELECT value_json FROM settings WHERE key = ?")
      .get("last-seen-version");
    if (typeof row?.value_json !== "string") return null;
    try {
      const value = JSON.parse(row.value_json);
      return typeof value === "string" && value.trim() ? value.trim() : null;
    } catch {
      return null;
    }
  }

  saveLastSeenVersion(version: string): void {
    const normalized = version.trim();
    if (!normalized) return;
    this.database
      .prepare(
        `INSERT INTO settings (key, value_json, updated_at)
         VALUES ('last-seen-version', ?, ?)
         ON CONFLICT(key) DO UPDATE SET
           value_json = excluded.value_json,
           updated_at = excluded.updated_at`
      )
      .run(JSON.stringify(normalized), Date.now());
  }

  loadActiveWorkspaceId(): string | null {
    const row = this.database
      .prepare("SELECT value_json FROM settings WHERE key = ?")
      .get("active-workspace-id");
    if (typeof row?.value_json !== "string") return null;
    try {
      const id = JSON.parse(row.value_json);
      return validateId(id) && this.getWorkspace(id) ? id : null;
    } catch {
      return null;
    }
  }

  saveActiveWorkspaceId(id: string): string {
    const workspaceId = validateId(id) ? id : HOME_WORKSPACE_ID;
    this.database
      .prepare(
        `INSERT INTO settings (key, value_json, updated_at)
         VALUES ('active-workspace-id', ?, ?)
         ON CONFLICT(key) DO UPDATE SET
           value_json = excluded.value_json,
           updated_at = excluded.updated_at`
      )
      .run(JSON.stringify(workspaceId), Date.now());
    return workspaceId;
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

  loadAppearance(): AppearanceSettings {
    const row = this.database
      .prepare("SELECT value_json FROM settings WHERE key = ?")
      .get("appearance");
    if (typeof row?.value_json !== "string") {
      return DEFAULT_APPEARANCE_SETTINGS;
    }
    try {
      return sanitizeAppearanceSettings(JSON.parse(row.value_json));
    } catch {
      return DEFAULT_APPEARANCE_SETTINGS;
    }
  }

  saveAppearance(value: unknown): AppearanceSettings {
    const settings = sanitizeAppearanceSettings(value);
    this.database
      .prepare(
        `INSERT INTO settings (key, value_json, updated_at)
         VALUES ('appearance', ?, ?)
         ON CONFLICT(key) DO UPDATE SET
           value_json = excluded.value_json,
           updated_at = excluded.updated_at`
      )
      .run(JSON.stringify(settings), Date.now());
    return settings;
  }

  loadSubagents(): SubagentModel[] {
    const row = this.database
      .prepare("SELECT value_json FROM settings WHERE key = ?")
      .get("subagents");
    if (typeof row?.value_json !== "string") return [];
    try {
      return sanitizeSubagentModels(JSON.parse(row.value_json));
    } catch {
      return [];
    }
  }

  saveSubagents(value: unknown): SubagentModel[] {
    const models = sanitizeSubagentModels(value);
    this.database
      .prepare(
        `INSERT INTO settings (key, value_json, updated_at)
         VALUES ('subagents', ?, ?)
         ON CONFLICT(key) DO UPDATE SET
           value_json = excluded.value_json,
           updated_at = excluded.updated_at`
      )
      .run(JSON.stringify(models), Date.now());
    return models;
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

  syncCodexModels(descriptors: CodexModelDescriptor[]): ModelConfig[] {
    const unique = new Map<string, CodexModelDescriptor>();
    for (const descriptor of descriptors) {
      const modelId = descriptor?.model?.trim();
      if (!modelId || modelId.length > PROVIDER_LIMITS.modelId) continue;
      if (unique.size >= PROVIDER_LIMITS.maxModelsPerProvider) break;
      unique.set(modelId, { ...descriptor, model: modelId });
    }

    if (unique.size === 0) {
      throw new Error("Codex did not return any available models.");
    }

    this.transaction(() => {
      const existing = new Map(
        this.listModels(CODEX_PROVIDER_ID).map((model) => [model.modelId, model])
      );

      for (const descriptor of unique.values()) {
        this.saveModel(
          createCodexModelConfig(descriptor, {
            existing: existing.get(descriptor.model) ?? null,
          })
        );
      }

      for (const model of existing.values()) {
        if (!unique.has(model.modelId)) {
          this.database
            .prepare("DELETE FROM provider_models WHERE id = ? AND provider_id = ?")
            .run(model.id, CODEX_PROVIDER_ID);
        }
      }

      this.ensureDefaultModelExists();
    });

    return this.listModels(CODEX_PROVIDER_ID);
  }

  getCodexChatThread(chatId: string): CodexChatThread | null {
    if (!validateId(chatId)) return null;
    const row = this.database
      .prepare(
        `SELECT chat_id, thread_id, last_user_message_id, created_at, updated_at
           FROM codex_chat_threads
          WHERE chat_id = ?`
      )
      .get(chatId);
    if (!row || !validateCodexThreadId(row.thread_id)) return null;
    return {
      chatId: String(row.chat_id),
      threadId: String(row.thread_id),
      lastUserMessageId:
        typeof row.last_user_message_id === "string"
          ? row.last_user_message_id
          : null,
      createdAt: asNumber(row.created_at),
      updatedAt: asNumber(row.updated_at),
    };
  }

  listCodexChatThreads(): CodexChatThread[] {
    return this.database
      .prepare(
        `SELECT chat_id, thread_id, last_user_message_id, created_at, updated_at
           FROM codex_chat_threads
          ORDER BY created_at ASC, chat_id ASC`
      )
      .all()
      .filter(
        (row) => validateId(row.chat_id) && validateCodexThreadId(row.thread_id)
      )
      .map((row) => ({
        chatId: String(row.chat_id),
        threadId: String(row.thread_id),
        lastUserMessageId:
          typeof row.last_user_message_id === "string"
            ? row.last_user_message_id
            : null,
        createdAt: asNumber(row.created_at),
        updatedAt: asNumber(row.updated_at),
      }));
  }

  saveCodexChatThread(input: {
    chatId: string;
    threadId: string;
    lastUserMessageId: string | null;
  }): CodexChatThread {
    if (!validateId(input.chatId)) throw new Error("Invalid chat id.");
    if (!validateCodexThreadId(input.threadId)) {
      throw new Error("Invalid Codex thread id.");
    }
    const lastUserMessageId =
      typeof input.lastUserMessageId === "string" &&
      input.lastUserMessageId.length <= 256 &&
      !/[\u0000-\u001f]/.test(input.lastUserMessageId)
        ? input.lastUserMessageId
        : null;
    const existing = this.getCodexChatThread(input.chatId);
    const now = Date.now();
    this.database
      .prepare(
        `INSERT INTO codex_chat_threads (
           chat_id, thread_id, last_user_message_id, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(chat_id) DO UPDATE SET
           thread_id = excluded.thread_id,
           last_user_message_id = excluded.last_user_message_id,
           updated_at = excluded.updated_at`
      )
      .run(
        input.chatId,
        input.threadId,
        lastUserMessageId,
        existing?.createdAt ?? now,
        now
      );
    return this.getCodexChatThread(input.chatId)!;
  }

  deleteCodexChatThread(chatId: string): void {
    if (!validateId(chatId)) return;
    this.database
      .prepare("DELETE FROM codex_chat_threads WHERE chat_id = ?")
      .run(chatId);
  }

  clearCodexChatThreads(): void {
    this.database.prepare("DELETE FROM codex_chat_threads").run();
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
        projects: this.loadWorkspaces().length,
        memories: this.loadMemories().length,
      };
    }

    return this.transaction(() => {
      for (const project of snapshot.projects) {
        this.saveWorkspace(
          sanitizeWorkspace({
            ...project,
            instructions: "",
            trust: DEFAULT_WORKSPACE_TRUST,
          })
        );
      }
      this.saveChats(
        snapshot.chats.map((chat) => {
          const legacy = chat as LocalChat & { projectId?: string | null };
          return {
            ...chat,
            workspaceId: chat.workspaceId ?? legacy.projectId ?? null,
          };
        })
      );
      this.savePersonalization(snapshot.personalization);
      this.saveMemories(snapshot.memories);
      this.database
        .prepare("INSERT INTO metadata (key, value) VALUES (?, ?)")
        .run(LEGACY_MIGRATION_KEY, new Date().toISOString());

      return {
        imported: true,
        chats: this.loadChats().length,
        projects: this.loadWorkspaces().length,
        memories: this.loadMemories().length,
      };
    });
  }
}
