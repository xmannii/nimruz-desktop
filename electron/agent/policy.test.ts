import assert from "node:assert/strict";
import test from "node:test";
import { evaluateToolPolicy, redactSecrets } from "./policy";
import { DEFAULT_WORKSPACE_TRUST } from "@/lib/workspace";

test("reads auto-approve by default", () => {
  const decision = evaluateToolPolicy({
    toolName: "read_file",
    trust: DEFAULT_WORKSPACE_TRUST,
  });
  assert.equal(decision.type, "approved");
});

test("writes auto-approve by default", () => {
  const decision = evaluateToolPolicy({
    toolName: "write_file",
    trust: DEFAULT_WORKSPACE_TRUST,
  });
  assert.equal(decision.type, "approved");
});

test("writes require approval when disabled", () => {
  const decision = evaluateToolPolicy({
    toolName: "write_file",
    trust: { ...DEFAULT_WORKSPACE_TRUST, autoApproveWrites: false },
  });
  assert.equal(decision.type, "user-approval");
});

test("shell requires approval by default", () => {
  const decision = evaluateToolPolicy({
    toolName: "run_command",
    trust: DEFAULT_WORKSPACE_TRUST,
  });
  assert.equal(decision.type, "user-approval");
});

test("destructive tools always require approval even when trusted", () => {
  const decision = evaluateToolPolicy({
    toolName: "delete_file",
    trust: {
      level: "auto_shell",
      autoApproveReads: true,
      autoApproveWrites: true,
      autoApproveShell: true,
      autoApproveNetwork: true,
    },
  });
  assert.equal(decision.type, "user-approval");
});

test("writes auto-approve when trust allows", () => {
  const decision = evaluateToolPolicy({
    toolName: "write_file",
    trust: {
      ...DEFAULT_WORKSPACE_TRUST,
      autoApproveWrites: true,
    },
  });
  assert.equal(decision.type, "approved");
});

test("shell auto-approves at auto_shell level", () => {
  const decision = evaluateToolPolicy({
    toolName: "run_command",
    trust: {
      level: "auto_shell",
      autoApproveReads: true,
      autoApproveWrites: true,
      autoApproveShell: true,
      autoApproveNetwork: true,
    },
  });
  assert.equal(decision.type, "approved");
});

test("network tools auto-approve by default", () => {
  const decision = evaluateToolPolicy({
    toolName: "fetch_url",
    trust: DEFAULT_WORKSPACE_TRUST,
  });
  assert.equal(decision.type, "approved");
});

test("network tools require approval when disabled", () => {
  const decision = evaluateToolPolicy({
    toolName: "fetch_url",
    trust: { ...DEFAULT_WORKSPACE_TRUST, autoApproveNetwork: false },
  });
  assert.equal(decision.type, "user-approval");
});

test("disabled slices deny the capability", () => {
  const decision = evaluateToolPolicy({
    toolName: "run_command",
    trust: DEFAULT_WORKSPACE_TRUST,
    slices: { shellTools: false },
  });
  assert.equal(decision.type, "denied");
});

test("expert delegation tools are auto-approved", () => {
  const decision = evaluateToolPolicy({
    toolName: "expert_researcher",
    trust: DEFAULT_WORKSPACE_TRUST,
  });
  assert.equal(decision.type, "approved");
});

test("research subagent delegation is auto-approved", () => {
  const decision = evaluateToolPolicy({
    toolName: "spawn_subagent",
    trust: DEFAULT_WORKSPACE_TRUST,
  });
  assert.equal(decision.type, "approved");
});

test("unknown tools require approval", () => {
  const decision = evaluateToolPolicy({
    toolName: "mystery_tool",
    trust: DEFAULT_WORKSPACE_TRUST,
  });
  assert.equal(decision.type, "user-approval");
});

test("redactSecrets masks sensitive keys and inline tokens", () => {
  const redacted = redactSecrets({
    apiKey: "sk-123456",
    nested: { password: "hunter2", note: "authorization: Bearer abc.def" },
    safe: "hello",
  }) as Record<string, unknown>;
  assert.equal(redacted.apiKey, "***");
  const nested = redacted.nested as Record<string, unknown>;
  assert.equal(nested.password, "***");
  assert.match(String(nested.note), /Bearer \*\*\*/);
  assert.equal(redacted.safe, "hello");
});
