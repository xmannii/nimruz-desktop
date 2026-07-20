import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  realpath,
  symlink,
  writeFile,
  rm,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  assertSafeRelativePath,
  PathPolicyError,
  resolveInsideRoots,
} from "./path-policy";

async function withTempDir(
  operation: (dir: string) => void | Promise<void>
) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "nimruz-path-"));
  try {
    await operation(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test("resolves a path inside an approved root", async () => {
  await withTempDir(async (dir) => {
    await writeFile(path.join(dir, "note.txt"), "hi");
    const { absolutePath, root } = resolveInsideRoots(
      path.join(dir, "note.txt"),
      [dir]
    );
    assert.equal(root, await realpath(dir));
    assert.ok(absolutePath.endsWith("note.txt"));
  });
});

test("rejects traversal outside the approved root", async () => {
  await withTempDir(async (dir) => {
    assert.throws(
      () => resolveInsideRoots(path.join(dir, "..", "escape.txt"), [dir]),
      PathPolicyError
    );
  });
});

test("rejects null bytes in the path", async () => {
  await withTempDir(async (dir) => {
    assert.throws(
      () => resolveInsideRoots(`${dir}/bad\0.txt`, [dir]),
      PathPolicyError
    );
  });
});

test("rejects when no roots are configured", () => {
  assert.throws(() => resolveInsideRoots("/tmp/x", []), PathPolicyError);
});

test("blocks symlink escapes out of the root", async () => {
  await withTempDir(async (dir) => {
    await withTempDir(async (outside) => {
      const secret = path.join(outside, "secret.txt");
      await writeFile(secret, "secret");
      const root = path.join(dir, "root");
      await mkdir(root);
      const link = path.join(root, "link.txt");
      try {
        await symlink(secret, link);
      } catch {
        return; // platform without symlink permission
      }
      assert.throws(() => resolveInsideRoots(link, [root]), PathPolicyError);
    });
  });
});

test("assertSafeRelativePath rejects traversal and absolute paths", () => {
  assert.throws(() => assertSafeRelativePath("../x"), PathPolicyError);
  assert.throws(() => assertSafeRelativePath("a/../../b"), PathPolicyError);
  assert.throws(() => assertSafeRelativePath("/abs"), PathPolicyError);
  assert.equal(assertSafeRelativePath("a/b/c.txt"), "a/b/c.txt");
});
