/**
 * Per-workspace Model Context Protocol (MCP) server configuration.
 *
 * Credentials are deliberately not part of this first slice. Persisting
 * arbitrary environment variables or authorization headers in SQLite would
 * make secrets look supported without secure storage. Stdio command/args and
 * unauthenticated HTTP/SSE endpoints cover the local-first use case while
 * leaving authenticated transports for a dedicated keychain-backed follow-up.
 */

export type McpTransportKind = "stdio" | "sse" | "http";

export type McpServerConfig = {
  id: string;
  workspaceId: string;
  name: string;
  transport: McpTransportKind;
  /** Executable path or command name for `stdio` transport. No shell is used. */
  command?: string;
  /** Literal process arguments for `stdio`; each item is passed separately. */
  args?: string[];
  /** Endpoint URL for `sse` / streamable `http` transports. */
  url?: string;
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
};

export type McpServerStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "error";

export type McpServerState = {
  serverId: string;
  status: McpServerStatus;
  error?: string;
  toolNames: string[];
};

export const MCP_SERVER_LIMITS = {
  maxServersPerWorkspace: 12,
  name: 80,
  command: 1_024,
  args: 32,
  arg: 2_000,
  url: 2_048,
} as const;

function isSafeId(value: unknown): value is string {
  return typeof value === "string" && /^[\w-]{1,128}$/.test(value);
}

function cleanOptionalText(value: unknown, maxLength: number) {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized ? normalized.slice(0, maxLength) : undefined;
}

function sanitizeRemoteUrl(value: unknown): string | undefined {
  const raw = cleanOptionalText(value, MCP_SERVER_LIMITS.url);
  if (!raw) return undefined;
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error("MCP server URL is invalid.");
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("MCP server URL must use HTTP or HTTPS.");
  }
  if (parsed.username || parsed.password) {
    throw new Error("MCP server URL cannot contain credentials.");
  }
  parsed.hash = "";
  return parsed.toString();
}

/**
 * Validate untrusted renderer/database input and return the canonical shape
 * consumed by storage and the main-process MCP runtime.
 */
export function sanitizeMcpServerConfig(
  value: unknown
): McpServerConfig {
  if (!value || typeof value !== "object") {
    throw new Error("Invalid MCP server configuration.");
  }
  const candidate = value as Partial<McpServerConfig>;
  if (!isSafeId(candidate.id) || !isSafeId(candidate.workspaceId)) {
    throw new Error("Invalid MCP server id.");
  }

  const name = cleanOptionalText(candidate.name, MCP_SERVER_LIMITS.name);
  if (!name) throw new Error("MCP server name is required.");

  const transport = candidate.transport;
  if (
    transport !== "stdio" &&
    transport !== "http" &&
    transport !== "sse"
  ) {
    throw new Error("Unsupported MCP transport.");
  }

  const createdAt = Number(candidate.createdAt);
  const updatedAt = Number(candidate.updatedAt);
  if (!Number.isFinite(createdAt) || !Number.isFinite(updatedAt)) {
    throw new Error("Invalid MCP server timestamps.");
  }

  const common = {
    id: candidate.id,
    workspaceId: candidate.workspaceId,
    name,
    transport,
    enabled: candidate.enabled === true,
    createdAt,
    updatedAt,
  };

  if (transport === "stdio") {
    const command = cleanOptionalText(
      candidate.command,
      MCP_SERVER_LIMITS.command
    );
    if (!command) throw new Error("MCP stdio command is required.");
    const args = Array.isArray(candidate.args)
      ? candidate.args
          .filter((arg): arg is string => typeof arg === "string")
          .slice(0, MCP_SERVER_LIMITS.args)
          .map((arg) => arg.slice(0, MCP_SERVER_LIMITS.arg))
      : [];
    return { ...common, command, args };
  }

  const url = sanitizeRemoteUrl(candidate.url);
  if (!url) throw new Error("MCP server URL is required.");
  return { ...common, url };
}

/** Stable, provider-safe prefix for tools discovered from one MCP server. */
export function mcpToolPrefix(serverId: string): string {
  const safeId = serverId
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 24);
  return `mcp_${safeId || "server"}_`;
}
