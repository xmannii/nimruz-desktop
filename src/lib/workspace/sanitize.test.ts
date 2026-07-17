import assert from "node:assert/strict";
import test from "node:test";
import { sanitizeWorkspaceRoot } from "./sanitize";

const base = {
  id: "root-1",
  workspaceId: "ws-1",
  kind: "linked" as const,
  path: "/home/user/project",
  label: "Project",
  createdAt: 123,
};

test("sanitizeWorkspaceRoot normalizes isPrimary to a boolean", () => {
  assert.equal(sanitizeWorkspaceRoot(base).isPrimary, false);
  assert.equal(
    sanitizeWorkspaceRoot({ ...base, isPrimary: true }).isPrimary,
    true
  );
  assert.equal(
    sanitizeWorkspaceRoot({ ...base, isPrimary: 1 as unknown as boolean })
      .isPrimary,
    true
  );
});

test("sanitizeWorkspaceRoot rejects invalid roots", () => {
  assert.throws(() => sanitizeWorkspaceRoot({ ...base, id: "" }));
  assert.throws(() => sanitizeWorkspaceRoot({ ...base, kind: "other" }));
  assert.throws(() => sanitizeWorkspaceRoot({ ...base, path: "" }));
});
