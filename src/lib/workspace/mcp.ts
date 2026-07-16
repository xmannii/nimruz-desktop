/**
 * Stub types and config for future MCP (Model Context Protocol) server
 * integration inside workspaces. Gated behind
 * `AGENTIC_WORKSPACE_FEATURE.slices.mcp`, which is `false` today.
 *
 * Nothing here is wired into the runtime yet; this exists so the data model
 * and UI can be extended incrementally without a breaking schema change
 * later.
 */

export type McpTransportKind = "stdio" | "sse" | "http";

export type McpServerConfig = {
  id: string;
  workspaceId: string;
  name: string;
  transport: McpTransportKind;
  /** Command to spawn for `stdio` transport. */
  command?: string;
  args?: string[];
  /** Endpoint URL for `sse` / `http` transports. */
  url?: string;
  env?: Record<string, string>;
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

/** Placeholder for the future per-workspace MCP server registry. */
export function listMcpServers(_workspaceId: string): McpServerConfig[] {
  return [];
}

/** Placeholder for the future MCP connection manager. */
export async function connectMcpServer(
  _config: McpServerConfig
): Promise<McpServerState> {
  throw new Error(
    "MCP support is not enabled yet. Enable AGENTIC_WORKSPACE_FEATURE.slices.mcp first."
  );
}
