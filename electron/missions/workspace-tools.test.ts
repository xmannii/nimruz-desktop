import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { executeWorkspaceTool } from "./workspace-tools";

test("workspace tools list, search, and write only inside the workspace", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "nimruz-mission-"));
  await mkdir(path.join(root, "docs"));
  await writeFile(path.join(root, "docs", "note.md"), "Quarterly report\n", "utf8");
  const listed = await executeWorkspaceTool("list_files", { path: "." }, root);
  assert.deepEqual(listed.data, { files: ["docs\\note.md"] });
  const searched = await executeWorkspaceTool("search_files", { query: "quarterly" }, root);
  assert.equal((searched.data as { matches: unknown[] }).matches.length, 1);
  await executeWorkspaceTool("write_file", { path: "result.md", content: "Done" }, root);
  assert.equal(await readFile(path.join(root, "result.md"), "utf8"), "Done");
  await assert.rejects(() => executeWorkspaceTool("read_file", { path: "../outside" }, root), /workspace/);
});
