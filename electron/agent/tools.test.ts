import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAgentTools,
  buildResearchSubagentTools,
  type AgentToolContext,
} from "./tools";

const baseContext = {
  workspaceId: null,
  chatId: "chat",
  runId: "run",
  database: {},
  files: {},
} as unknown as AgentToolContext;

test("main agent exposes distinct tools without search aliases or stubs", () => {
  const tools = buildAgentTools(baseContext);

  assert.ok("search_files" in tools);
  assert.ok(!("grep" in tools));
  assert.ok(!("web_search" in tools));
  assert.ok("fetch_url" in tools);
});

test("research subagent receives only context-safe read tools", () => {
  const tools = buildResearchSubagentTools({
    ...baseContext,
    workspaceId: "workspace",
  });

  assert.deepEqual(Object.keys(tools).sort(), [
    "fetch_url",
    "list_directory",
    "read_file",
    "search_files",
  ]);
});

test("research subagent capabilities can be removed by parent policy", () => {
  const tools = buildResearchSubagentTools(
    {
      ...baseContext,
      workspaceId: "workspace",
    },
    { allowWorkspaceRead: false, allowNetwork: false }
  );

  assert.deepEqual(Object.keys(tools), []);
});
