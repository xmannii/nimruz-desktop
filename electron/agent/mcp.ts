import { createMCPClient, type MCPClient } from "@ai-sdk/mcp";
import { Experimental_StdioMCPTransport } from "@ai-sdk/mcp/mcp-stdio";
import type { ToolSet } from "ai";
import {
  mcpToolPrefix,
  sanitizeMcpServerConfig,
  type McpServerConfig,
  type McpServerState,
} from "@/lib/workspace";

const MCP_CONNECT_TIMEOUT_MS = 15_000;

export function selectMcpServersForChat(
  servers: McpServerConfig[],
  serverIds: string[] | undefined
): McpServerConfig[] {
  if (serverIds === undefined) return servers;
  const selected = new Set(serverIds);
  return servers.filter((server) => selected.has(server.id));
}
const MAX_PROVIDER_TOOL_NAME = 64;

type ConnectedServer = {
  client: MCPClient;
  state: McpServerState;
  instructions?: string;
  tools: ToolSet;
};

export type McpToolSession = {
  tools: ToolSet;
  states: McpServerState[];
  instructions: string;
  close: () => Promise<void>;
};

function stdioEnvironment(cwd: string): Record<string, string> {
  const allowed = new Set([
    "PATH",
    "PATHEXT",
    "SystemRoot",
    "HOME",
    "USERPROFILE",
    "LANG",
    "LC_ALL",
    "TMPDIR",
    "TMP",
    "TEMP",
  ]);
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (allowed.has(key) && typeof value === "string") env[key] = value;
  }
  env.NIMRUZ_WORKSPACE = cwd;
  return env;
}

function providerToolName(
  prefix: string,
  originalName: string,
  usedNames: Set<string>
): string {
  const safeOriginal =
    originalName
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "_")
      .replace(/^_+|_+$/g, "") || "tool";
  const available = Math.max(1, MAX_PROVIDER_TOOL_NAME - prefix.length);
  const base = `${prefix}${safeOriginal.slice(0, available)}`;
  let candidate = base;
  let suffix = 2;
  while (usedNames.has(candidate)) {
    const marker = `_${suffix++}`;
    candidate = `${base.slice(0, MAX_PROVIDER_TOOL_NAME - marker.length)}${marker}`;
  }
  usedNames.add(candidate);
  return candidate;
}

/**
 * MCP tools are namespaced before entering the shared ToolSet. This prevents
 * one server from replacing a built-in tool or another server's same-named
 * tool, while keeping names within common model-provider limits.
 */
export function namespaceMcpTools(
  server: McpServerConfig,
  source: ToolSet,
  usedNames = new Set<string>()
): ToolSet {
  const result: ToolSet = {};
  const prefix = mcpToolPrefix(server.id);
  for (const [originalName, definition] of Object.entries(source)) {
    const name = providerToolName(prefix, originalName, usedNames);
    result[name] = {
      ...definition,
      description: `[MCP: ${server.name}] ${
        definition.description ?? originalName
      }`,
    } as ToolSet[string];
  }
  return result;
}

async function createClient(
  server: McpServerConfig,
  cwd: string
): Promise<MCPClient> {
  if (server.transport === "stdio") {
    return createMCPClient({
      clientName: "nimruz-desktop",
      version: "1",
      transport: new Experimental_StdioMCPTransport({
        command: server.command!,
        args: server.args ?? [],
        cwd,
        // Never inherit arbitrary app credentials into third-party servers.
        env: stdioEnvironment(cwd),
        // Servers may be chatty; an unread pipe could deadlock the protocol.
        stderr: "ignore",
      }),
    });
  }
  return createMCPClient({
    clientName: "nimruz-desktop",
    version: "1",
    transport: {
      type: server.transport,
      url: server.url!,
      redirect: "error",
    },
  });
}

async function connectServer(
  rawServer: McpServerConfig,
  cwd: string,
  usedNames: Set<string>
): Promise<ConnectedServer> {
  const server = sanitizeMcpServerConfig(rawServer);
  let timedOut = false;
  const pendingClient = createClient(server, cwd);
  const client = await Promise.race([
    pendingClient,
    new Promise<never>((_, reject) => {
      const timer = setTimeout(() => {
        timedOut = true;
        reject(new Error(`MCP connection timed out after ${MCP_CONNECT_TIMEOUT_MS}ms.`));
      }, MCP_CONNECT_TIMEOUT_MS);
      timer.unref?.();
      void pendingClient.then(
        () => clearTimeout(timer),
        () => clearTimeout(timer)
      );
    }),
  ]).catch((error) => {
    if (timedOut) {
      void pendingClient
        .then((lateClient) => lateClient.close())
        .catch(() => undefined);
    }
    throw error;
  });

  try {
    const sourceTools = await client.tools();
    const tools = namespaceMcpTools(server, sourceTools, usedNames);
    return {
      client,
      tools,
      instructions: client.instructions,
      state: {
        serverId: server.id,
        status: "connected",
        toolNames: Object.keys(sourceTools),
      },
    };
  } catch (error) {
    await client.close().catch(() => undefined);
    throw error;
  }
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return "MCP connection failed.";
}

/**
 * Connect all enabled servers for one agent run. Individual server failures
 * are isolated so an unavailable optional integration cannot break the chat.
 */
export async function createMcpToolSession(options: {
  servers: McpServerConfig[];
  cwd: string;
}): Promise<McpToolSession> {
  const enabled = options.servers.filter((server) => server.enabled);
  const usedNames = new Set<string>();
  const results = await Promise.allSettled(
    enabled.map((server) => connectServer(server, options.cwd, usedNames))
  );
  const connected: ConnectedServer[] = [];
  const states: McpServerState[] = [];

  results.forEach((result, index) => {
    const server = enabled[index]!;
    if (result.status === "fulfilled") {
      connected.push(result.value);
      states.push(result.value.state);
    } else {
      states.push({
        serverId: server.id,
        status: "error",
        error: errorMessage(result.reason),
        toolNames: [],
      });
    }
  });

  const tools = Object.assign({}, ...connected.map((item) => item.tools));
  const instructions = connected
    .flatMap((item) =>
      item.instructions?.trim()
        ? [`### ${enabled.find((server) => server.id === item.state.serverId)?.name}\n${item.instructions.trim()}`]
        : []
    )
    .join("\n\n");

  let closed = false;
  return {
    tools,
    states,
    instructions,
    async close() {
      if (closed) return;
      closed = true;
      await Promise.allSettled(
        connected.map((item) => item.client.close())
      );
    },
  };
}

/** Connect, discover tools, and close immediately for the settings test UI. */
export async function testMcpServerConnection(options: {
  server: McpServerConfig;
  cwd: string;
}): Promise<McpServerState> {
  const session = await createMcpToolSession({
    servers: [{ ...options.server, enabled: true }],
    cwd: options.cwd,
  });
  try {
    return (
      session.states[0] ?? {
        serverId: options.server.id,
        status: "error",
        error: "MCP server did not return a connection state.",
        toolNames: [],
      }
    );
  } finally {
    await session.close();
  }
}
