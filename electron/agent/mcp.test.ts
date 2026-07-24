import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import type { McpServerConfig } from "@/lib/workspace";
import {
  createMcpToolSession,
  namespaceMcpTools,
  selectMcpServersForChat,
  testMcpServerConnection,
} from "./mcp";

const fixturePath = path.join(
  process.cwd(),
  "electron",
  "agent",
  "fixtures",
  "mcp-echo-server.mjs"
);

const server: McpServerConfig = {
  id: "echo-server",
  workspaceId: "workspace-1",
  name: "Echo fixture",
  transport: "stdio",
  command: process.execPath,
  args: [fixturePath],
  enabled: true,
  createdAt: 1,
  updatedAt: 1,
};

test("selects an explicit per-chat MCP subset", () => {
  const other = { ...server, id: "other-server", name: "Other" };
  assert.deepEqual(
    selectMcpServersForChat([server, other], undefined).map((item) => item.id),
    ["echo-server", "other-server"]
  );
  assert.deepEqual(
    selectMcpServersForChat([server, other], ["other-server"]).map(
      (item) => item.id
    ),
    ["other-server"]
  );
  assert.deepEqual(selectMcpServersForChat([server, other], []), []);
});

test("namespaces MCP tools so they cannot replace built-in tools", () => {
  const tools = namespaceMcpTools(server, {
    read_file: {
      description: "unsafe collision",
      inputSchema: { type: "object" } as never,
    },
  });
  assert.deepEqual(Object.keys(tools), ["mcp_echo-server_read_file"]);
  assert.match(
    String(tools["mcp_echo-server_read_file"]?.description ?? ""),
    /^\[MCP: Echo fixture\]/
  );
});

test("connects to a real stdio MCP server and discovers its tools", async () => {
  const state = await testMcpServerConnection({
    server,
    cwd: process.cwd(),
  });
  assert.deepEqual(state, {
    serverId: server.id,
    status: "connected",
    toolNames: ["echo"],
  });
});

test("executes a real namespaced MCP tool and closes the session", async () => {
  const session = await createMcpToolSession({
    servers: [server],
    cwd: process.cwd(),
  });
  try {
    const echo = session.tools["mcp_echo-server_echo"];
    assert.ok(echo?.execute);
    const result = await echo.execute(
      { text: "زنده است" },
      {
        toolCallId: "test-call",
        messages: [],
      } as never
    );
    assert.deepEqual(result, {
      content: [{ type: "text", text: "زنده است" }],
      isError: false,
    });
  } finally {
    await session.close();
  }
});

test("isolates a failed MCP server instead of failing the agent tool set", async () => {
  const session = await createMcpToolSession({
    servers: [{ ...server, command: "definitely-missing-nimruz-command" }],
    cwd: process.cwd(),
  });
  try {
    assert.deepEqual(session.tools, {});
    assert.equal(session.states[0]?.status, "error");
    assert.match(session.states[0]?.error ?? "", /ENOENT|spawn/i);
  } finally {
    await session.close();
  }
});
