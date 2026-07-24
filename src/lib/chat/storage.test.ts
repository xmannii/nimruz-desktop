import assert from "node:assert/strict";
import test from "node:test";
import { sanitizeMcpServerIds } from "./storage";

test("sanitizes a per-chat MCP server allowlist", () => {
  assert.deepEqual(
    sanitizeMcpServerIds(["one", "two", "one", "../unsafe", 3]),
    ["one", "two"]
  );
});

test("distinguishes the default MCP behavior from an explicit empty list", () => {
  assert.equal(sanitizeMcpServerIds(undefined), undefined);
  assert.deepEqual(sanitizeMcpServerIds([]), []);
});
