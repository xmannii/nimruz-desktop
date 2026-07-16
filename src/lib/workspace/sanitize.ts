import {
  DEFAULT_WORKSPACE_TRUST,
  type LocalWorkspace,
  type WorkspaceRoot,
  type WorkspaceTrustSettings,
} from "./types";

function isId(value: unknown): value is string {
  return typeof value === "string" && /^[\w-]{1,128}$/.test(value);
}

export function normalizeWorkspaceTrust(
  value: unknown
): WorkspaceTrustSettings {
  if (!value || typeof value !== "object") {
    return { ...DEFAULT_WORKSPACE_TRUST };
  }

  const input = value as Partial<WorkspaceTrustSettings>;
  const level =
    input.level === "ask" ||
    input.level === "auto_read" ||
    input.level === "auto_write" ||
    input.level === "auto_shell"
      ? input.level
      : DEFAULT_WORKSPACE_TRUST.level;

  return {
    level,
    autoApproveReads:
      typeof input.autoApproveReads === "boolean"
        ? input.autoApproveReads
        : level === "auto_read" ||
          level === "auto_write" ||
          level === "auto_shell" ||
          DEFAULT_WORKSPACE_TRUST.autoApproveReads,
    autoApproveWrites:
      typeof input.autoApproveWrites === "boolean"
        ? input.autoApproveWrites
        : level === "auto_write" ||
          level === "auto_shell" ||
          DEFAULT_WORKSPACE_TRUST.autoApproveWrites,
    autoApproveShell:
      typeof input.autoApproveShell === "boolean"
        ? input.autoApproveShell
        : level === "auto_shell",
    autoApproveNetwork:
      typeof input.autoApproveNetwork === "boolean"
        ? input.autoApproveNetwork
        : DEFAULT_WORKSPACE_TRUST.autoApproveNetwork,
  };
}

export function sanitizeWorkspace(value: unknown): LocalWorkspace {
  if (!value || typeof value !== "object") {
    throw new Error("Workspace is invalid.");
  }

  const workspace = value as Partial<LocalWorkspace> & {
    /** Legacy project field. */
    description?: string;
  };

  if (
    !isId(workspace.id) ||
    typeof workspace.title !== "string" ||
    !Number.isFinite(workspace.createdAt) ||
    !Number.isFinite(workspace.updatedAt)
  ) {
    throw new Error("Workspace is invalid.");
  }

  return {
    id: workspace.id,
    title: workspace.title.trim().slice(0, 500) || "Workspace",
    description: String(workspace.description ?? "").slice(0, 10_000),
    instructions: String(workspace.instructions ?? "").slice(0, 20_000),
    trust: normalizeWorkspaceTrust(workspace.trust),
    createdAt: Number(workspace.createdAt),
    updatedAt: Number(workspace.updatedAt),
  };
}

export function sanitizeWorkspaceRoot(value: unknown): WorkspaceRoot {
  if (!value || typeof value !== "object") {
    throw new Error("Workspace root is invalid.");
  }

  const root = value as Partial<WorkspaceRoot>;
  if (
    !isId(root.id) ||
    !isId(root.workspaceId) ||
    (root.kind !== "managed" && root.kind !== "linked") ||
    typeof root.path !== "string" ||
    !root.path.trim() ||
    typeof root.label !== "string" ||
    !Number.isFinite(root.createdAt)
  ) {
    throw new Error("Workspace root is invalid.");
  }

  return {
    id: root.id,
    workspaceId: root.workspaceId,
    kind: root.kind,
    path: root.path,
    label: root.label.slice(0, 500),
    isPrimary: Boolean(root.isPrimary),
    createdAt: Number(root.createdAt),
  };
}
