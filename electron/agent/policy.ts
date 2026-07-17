import type {
  ToolCallRisk,
  WorkspaceTrustSettings,
} from "@/lib/workspace";
import { DEFAULT_WORKSPACE_TRUST } from "@/lib/workspace";

export type ToolCapability =
  | "filesystem_read"
  | "filesystem_write"
  | "filesystem_delete"
  | "shell"
  | "network"
  | "memory"
  | "experts"
  | "skills"
  | "artifacts"
  | "tasks";

export type ToolMeta = {
  name: string;
  capability: ToolCapability;
  risk: ToolCallRisk;
  description: string;
  timeoutMs: number;
  maxOutputBytes: number;
};

export const TOOL_REGISTRY: Record<string, ToolMeta> = {
  list_directory: {
    name: "list_directory",
    capability: "filesystem_read",
    risk: "read",
    description: "List files in a workspace directory",
    timeoutMs: 10_000,
    maxOutputBytes: 64_000,
  },
  read_file: {
    name: "read_file",
    capability: "filesystem_read",
    risk: "read",
    description: "Read a text file from the workspace",
    timeoutMs: 15_000,
    maxOutputBytes: 512_000,
  },
  search_files: {
    name: "search_files",
    capability: "filesystem_read",
    risk: "read",
    description: "Grep file names and contents in the workspace",
    timeoutMs: 30_000,
    maxOutputBytes: 128_000,
  },
  grep: {
    name: "grep",
    capability: "filesystem_read",
    risk: "read",
    description: "Grep file names and contents in the workspace",
    timeoutMs: 30_000,
    maxOutputBytes: 128_000,
  },
  write_file: {
    name: "write_file",
    capability: "filesystem_write",
    risk: "write",
    description: "Create or overwrite a workspace file",
    timeoutMs: 15_000,
    maxOutputBytes: 8_000,
  },
  apply_patch: {
    name: "apply_patch",
    capability: "filesystem_write",
    risk: "write",
    description: "Apply a text replacement to a workspace file",
    timeoutMs: 15_000,
    maxOutputBytes: 8_000,
  },
  move_file: {
    name: "move_file",
    capability: "filesystem_write",
    risk: "write",
    description: "Move or rename a workspace file",
    timeoutMs: 15_000,
    maxOutputBytes: 8_000,
  },
  delete_file: {
    name: "delete_file",
    capability: "filesystem_delete",
    risk: "destructive",
    description: "Delete a workspace file",
    timeoutMs: 15_000,
    maxOutputBytes: 8_000,
  },
  run_command: {
    name: "run_command",
    capability: "shell",
    risk: "shell",
    description: "Run a shell command inside a workspace root",
    timeoutMs: 60_000,
    maxOutputBytes: 256_000,
  },
  fetch_url: {
    name: "fetch_url",
    capability: "network",
    risk: "network",
    description: "Fetch a public web page as text",
    timeoutMs: 20_000,
    maxOutputBytes: 64_000,
  },
  web_search: {
    name: "web_search",
    capability: "network",
    risk: "network",
    description: "Search the web via the configured provider",
    timeoutMs: 20_000,
    maxOutputBytes: 64_000,
  },
  create_artifact: {
    name: "create_artifact",
    capability: "artifacts",
    risk: "write",
    description: "Create a durable workspace artifact",
    timeoutMs: 15_000,
    maxOutputBytes: 8_000,
  },
  update_task: {
    name: "update_task",
    capability: "tasks",
    risk: "write",
    description: "Create or update a workspace task",
    timeoutMs: 10_000,
    maxOutputBytes: 8_000,
  },
  save_memory: {
    name: "save_memory",
    capability: "memory",
    risk: "write",
    description: "Save a memory about the user",
    timeoutMs: 5_000,
    maxOutputBytes: 4_000,
  },
  delete_memory: {
    name: "delete_memory",
    capability: "memory",
    risk: "destructive",
    description: "Delete a saved memory",
    timeoutMs: 5_000,
    maxOutputBytes: 4_000,
  },
  create_expert: {
    name: "create_expert",
    capability: "experts",
    risk: "write",
    description: "Create a specialist expert",
    timeoutMs: 5_000,
    maxOutputBytes: 4_000,
  },
  load_skill: {
    name: "load_skill",
    capability: "skills",
    risk: "read",
    description: "Load an installed skill",
    timeoutMs: 10_000,
    maxOutputBytes: 128_000,
  },
};

export type PolicyDecision =
  | { type: "approved"; reason?: string }
  | { type: "denied"; reason: string }
  | { type: "user-approval"; reason?: string }
  | { type: "not-applicable" };

export function evaluateToolPolicy(options: {
  toolName: string;
  trust?: WorkspaceTrustSettings | null;
  slices?: {
    readTools?: boolean;
    writeTools?: boolean;
    shellTools?: boolean;
    artifactsTasks?: boolean;
  };
}): PolicyDecision {
  const meta = TOOL_REGISTRY[options.toolName];
  const trust = options.trust ?? DEFAULT_WORKSPACE_TRUST;
  const slices = {
    readTools: true,
    writeTools: true,
    shellTools: true,
    artifactsTasks: true,
    ...options.slices,
  };

  // Expert delegation tools are dynamic; treat as read/network nested work.
  if (options.toolName.startsWith("expert_")) {
    return { type: "approved", reason: "Expert delegation is auto-approved." };
  }

  if (!meta) {
    return { type: "user-approval", reason: "Unknown tool requires approval." };
  }

  if (
    (meta.capability === "filesystem_read" || meta.capability === "skills") &&
    !slices.readTools
  ) {
    return { type: "denied", reason: "Read tools are disabled." };
  }
  if (
    (meta.capability === "filesystem_write" ||
      meta.capability === "artifacts" ||
      meta.capability === "tasks") &&
    !slices.writeTools
  ) {
    return { type: "denied", reason: "Write tools are disabled." };
  }
  if (meta.capability === "shell" && !slices.shellTools) {
    return { type: "denied", reason: "Shell tools are disabled." };
  }
  if (
    (meta.capability === "artifacts" || meta.capability === "tasks") &&
    !slices.artifactsTasks
  ) {
    return { type: "denied", reason: "Artifacts and tasks are disabled." };
  }

  if (meta.risk === "destructive") {
    return {
      type: "user-approval",
      reason: "Destructive actions always require approval.",
    };
  }

  if (meta.risk === "read" || meta.capability === "skills") {
    if (trust.autoApproveReads || trust.level !== "ask") {
      return { type: "approved", reason: "Read operations auto-approved." };
    }
    return { type: "user-approval" };
  }

  if (meta.risk === "network") {
    if (trust.autoApproveNetwork) {
      return { type: "approved", reason: "Network actions auto-approved by trust settings." };
    }
    return {
      type: "user-approval",
      reason: "External network actions require approval.",
    };
  }

  if (meta.risk === "write") {
    if (trust.autoApproveWrites || trust.level === "auto_write" || trust.level === "auto_shell") {
      return { type: "approved", reason: "Writes auto-approved by trust settings." };
    }
    return { type: "user-approval" };
  }

  if (meta.risk === "shell") {
    if (trust.autoApproveShell || trust.level === "auto_shell") {
      return { type: "approved", reason: "Shell auto-approved by trust settings." };
    }
    return { type: "user-approval" };
  }

  return { type: "user-approval" };
}

export function redactSecrets(value: unknown): unknown {
  if (typeof value === "string") {
    return value
      .replace(/(api[_-]?key|token|secret|password)\s*[:=]\s*["']?[\w.-]+/gi, "$1=***")
      .replace(/Bearer\s+[\w.-]+/gi, "Bearer ***");
  }
  if (Array.isArray(value)) {
    return value.map(redactSecrets);
  }
  if (value && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      if (/key|token|secret|password|authorization/i.test(key)) {
        result[key] = "***";
      } else {
        result[key] = redactSecrets(entry);
      }
    }
    return result;
  }
  return value;
}
