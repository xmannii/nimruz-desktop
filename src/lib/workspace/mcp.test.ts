import assert from "node:assert/strict";
import test from "node:test";
import {
  mcpToolPrefix,
  sanitizeMcpServerConfig,
} from "./mcp";

const base = {
  id: "server-1",
  workspaceId: "workspace-1",
  name: " Local tools ",
  enabled: true,
  createdAt: 1,
  updatedAt: 2,
};

test("sanitizes a stdio MCP server without adding shell semantics", () => {
  assert.deepEqual(
    sanitizeMcpServerConfig({
      ...base,
      transport: "stdio",
      command: " node ",
      args: ["server.mjs", "--safe"],
      url: "https://ignored.example",
    }),
    {
      ...base,
      name: "Local tools",
      transport: "stdio",
      command: "node",
      args: ["server.mjs", "--safe"],
    }
  );
});

test("normalizes HTTP MCP URLs and rejects embedded credentials", () => {
  assert.equal(
    sanitizeMcpServerConfig({
      ...base,
      transport: "http",
      url: "http://127.0.0.1:3333/mcp#ignored",
    }).url,
    "http://127.0.0.1:3333/mcp"
  );
  assert.throws(
    () =>
      sanitizeMcpServerConfig({
        ...base,
        transport: "sse",
        url: "https://user:secret@example.com/sse",
      }),
    /cannot contain credentials/
  );
});

test("requires the transport-specific MCP connection field", () => {
  assert.throws(
    () => sanitizeMcpServerConfig({ ...base, transport: "stdio" }),
    /command is required/
  );
  assert.throws(
    () => sanitizeMcpServerConfig({ ...base, transport: "http" }),
    /URL is required/
  );
});

test("builds a stable provider-safe MCP tool prefix", () => {
  assert.equal(mcpToolPrefix("Server One/Unsafe"), "mcp_server_one_unsafe_");
});
