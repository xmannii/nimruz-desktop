/** Workspace and agent-run domain types shared by renderer and main. */

export type WorkspaceTrustLevel = "ask" | "auto_read" | "auto_write" | "auto_shell";

export type WorkspaceRootKind = "managed" | "linked";

export type WorkspaceRoot = {
  id: string;
  workspaceId: string;
  kind: WorkspaceRootKind;
  /** Absolute canonical path on disk. */
  path: string;
  label: string;
  /**
   * Primary working root. Relative agent paths and the default shell cwd
   * resolve against this root. Exactly one root should be primary; when no
   * linked root is primary the managed root acts as the implicit primary.
   */
  isPrimary: boolean;
  createdAt: number;
};

export type WorkspaceTrustSettings = {
  /** Default trust for tools in this workspace. */
  level: WorkspaceTrustLevel;
  /** Auto-approve read tools within approved roots. */
  autoApproveReads: boolean;
  /** Auto-approve write tools within approved roots. */
  autoApproveWrites: boolean;
  /** Auto-approve shell within approved roots. */
  autoApproveShell: boolean;
  /** Auto-approve network tools (web fetch/search). */
  autoApproveNetwork: boolean;
};

export const DEFAULT_WORKSPACE_TRUST: WorkspaceTrustSettings = {
  level: "ask",
  autoApproveReads: true,
  autoApproveWrites: true,
  autoApproveShell: false,
  autoApproveNetwork: true,
};

/** Stable id for the built-in Home workspace where default chats live. */
export const HOME_WORKSPACE_ID = "home";
export const HOME_WORKSPACE_TITLE = "خانه";

export function isHomeWorkspace(
  workspace: { id: string } | string | null | undefined
): boolean {
  if (!workspace) return false;
  return (typeof workspace === "string" ? workspace : workspace.id) ===
    HOME_WORKSPACE_ID;
}

export function createHomeWorkspace(now = Date.now()): LocalWorkspace {
  return {
    id: HOME_WORKSPACE_ID,
    title: HOME_WORKSPACE_TITLE,
    description: "فضای پیش‌فرض برای گفتگوها",
    instructions: "",
    trust: { ...DEFAULT_WORKSPACE_TRUST },
    createdAt: now,
    updatedAt: now,
  };
}

export type LocalWorkspace = {
  id: string;
  title: string;
  description: string;
  /** Optional instructions injected into the agent system prompt. */
  instructions: string;
  trust: WorkspaceTrustSettings;
  createdAt: number;
  updatedAt: number;
};

export type WorkspaceInput = {
  title: string;
  description?: string;
  instructions?: string;
  trust?: Partial<WorkspaceTrustSettings>;
  /**
   * Required PC folder for project workspaces (not Home). Linked as the
   * primary working root right after creation.
   */
  primaryFolderPath?: string;
};

export type AgentRunStatus =
  | "queued"
  | "running"
  | "awaiting_approval"
  | "completed"
  | "failed"
  | "cancelled";

export type AgentRun = {
  id: string;
  workspaceId: string | null;
  chatId: string;
  status: AgentRunStatus;
  model: string;
  providerId: string;
  error: string | null;
  stepCount: number;
  startedAt: number;
  updatedAt: number;
  finishedAt: number | null;
};

export type AgentRunStep = {
  id: string;
  runId: string;
  stepIndex: number;
  kind: "model" | "tool" | "approval" | "error";
  summary: string;
  detailJson: string | null;
  createdAt: number;
};

export type ToolCallRisk = "read" | "write" | "shell" | "network" | "destructive" | "external";

export type ToolCallRecord = {
  id: string;
  runId: string;
  toolName: string;
  risk: ToolCallRisk;
  inputJson: string;
  outputJson: string | null;
  status: "queued" | "running" | "awaiting_approval" | "completed" | "failed" | "denied";
  error: string | null;
  startedAt: number;
  finishedAt: number | null;
};

export type ApprovalDecision = "pending" | "approved" | "denied";

export type ApprovalRecord = {
  id: string;
  runId: string;
  toolCallId: string;
  toolName: string;
  risk: ToolCallRisk;
  reason: string;
  decision: ApprovalDecision;
  decidedAt: number | null;
  createdAt: number;
};

/** Renderable artifact kinds. Legacy values may still appear in stored rows. */
export type ArtifactKind =
  | "html"
  | "markdown"
  | "svg"
  | "mermaid"
  | "code"
  | "data"
  | "document"
  | "image"
  | "other";

export type ArtifactRecord = {
  id: string;
  workspaceId: string;
  runId: string | null;
  chatId: string | null;
  title: string;
  kind: ArtifactKind;
  mimeType: string;
  /** Relative path under managed workspace storage, or absolute linked path. */
  storagePath: string;
  sizeBytes: number;
  contentHash: string | null;
  createdAt: number;
  updatedAt: number;
};

export type TaskStatus = "todo" | "in_progress" | "done" | "cancelled";

export type TaskRecord = {
  id: string;
  workspaceId: string;
  runId: string | null;
  chatId: string | null;
  title: string;
  description: string;
  status: TaskStatus;
  createdAt: number;
  updatedAt: number;
};

export type PlanStatus = "draft" | "active" | "completed" | "cancelled";

export type PlanStepStatus =
  | "pending"
  | "in_progress"
  | "completed"
  | "blocked";

export type PlanStep = {
  /** Stable tool-facing identifier; never derived from display order. */
  id: string;
  title: string;
  description: string;
  status: PlanStepStatus;
};

export type PlanRecord = {
  id: string;
  workspaceId: string;
  runId: string | null;
  chatId: string | null;
  title: string;
  /** Supporting design/research narrative. Execution progress lives in steps. */
  markdown: string;
  steps: PlanStep[];
  status: PlanStatus;
  createdAt: number;
  updatedAt: number;
};

export type WorkspaceFileEntry = {
  path: string;
  name: string;
  kind: "file" | "directory";
  sizeBytes: number | null;
  modifiedAt: number | null;
};

export type WorkspaceFileChange = {
  path: string;
  relativePath: string;
  status: "added" | "modified" | "deleted" | "renamed" | "untracked";
  additions: number;
  deletions: number;
  /** Unified diff when available. Kept bounded by the main process. */
  diff: string | null;
  /** Set when a recorded workspace-agent write touched this path. */
  agentTouched: boolean;
  agentRunId: string | null;
};

/**
 * Typed live workspace events emitted by the main process. Each event is
 * scoped by `workspaceId` and carries only safe identifiers/paths.
 */
export type WorkspaceEvent =
  | { type: "file-created"; workspaceId: string; path: string }
  | { type: "file-updated"; workspaceId: string; path: string }
  | { type: "file-deleted"; workspaceId: string; path: string }
  | { type: "file-moved"; workspaceId: string; from: string; to: string }
  | { type: "artifact-changed"; workspaceId: string; artifactId?: string }
  | { type: "task-changed"; workspaceId: string; taskId?: string }
  | { type: "plan-changed"; workspaceId: string; planId?: string }
  | {
      type: "run-changed";
      workspaceId: string | null;
      runId: string;
      status?: string;
    }
  | { type: "approval-changed"; workspaceId: string | null; runId: string }
  | { type: "root-changed"; workspaceId: string };

export type WorkspaceEventType = WorkspaceEvent["type"];

/** Feature flag for the agentic workspace experience. */
export const AGENTIC_WORKSPACE_FEATURE = {
  id: "agentic-workspace",
  /** Ship enabled; slices still gate individual capabilities. */
  enabled: true,
  slices: {
    managedWorkspace: true,
    linkedFolders: true,
    readTools: true,
    writeTools: true,
    shellTools: true,
    artifactsTasks: true,
    mcp: true,
    browserAutomation: false,
    backgroundRuns: false,
  },
} as const;
