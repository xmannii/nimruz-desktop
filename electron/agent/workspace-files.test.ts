import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { mkdirSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { nanoid } from "nanoid";
import test from "node:test";
import { DEFAULT_WORKSPACE_TRUST } from "@/lib/workspace";
import type { LocalWorkspace } from "@/lib/chat/storage";
import { AppDatabase } from "../storage/database";
import { WorkspaceFilesStore } from "./workspace-files";
import { PathPolicyError } from "./path-policy";

const WORKSPACE_ID = "ws-files-1";

const workspace: LocalWorkspace = {
  id: WORKSPACE_ID,
  title: "Files WS",
  description: "",
  instructions: "",
  trust: DEFAULT_WORKSPACE_TRUST,
  createdAt: 1,
  updatedAt: 2,
};

async function withStore(
  operation: (store: WorkspaceFilesStore) => void | Promise<void>
) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "nimruz-wsfiles-"));
  const database = new AppDatabase(path.join(directory, "test.sqlite3"));
  database.saveWorkspace(workspace);
  const store = new WorkspaceFilesStore(database, path.join(directory, "data"));
  try {
    await operation(store);
  } finally {
    database.close();
    await rm(directory, { recursive: true, force: true });
  }
}

async function withContext(
  operation: (context: {
    store: WorkspaceFilesStore;
    database: AppDatabase;
    directory: string;
  }) => void | Promise<void>
) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "nimruz-wsfiles-"));
  const database = new AppDatabase(path.join(directory, "test.sqlite3"));
  database.saveWorkspace(workspace);
  const store = new WorkspaceFilesStore(database, path.join(directory, "data"));
  try {
    await operation({ store, database, directory });
  } finally {
    database.close();
    await rm(directory, { recursive: true, force: true });
  }
}

test("writes and reads a file inside the managed root", async () => {
  await withStore((store) => {
    store.writeFile(WORKSPACE_ID, "notes/todo.txt", "buy milk");
    const read = store.readFile(WORKSPACE_ID, "notes/todo.txt");
    assert.equal(read.content, "buy milk");
    assert.equal(read.truncated, false);
  });
});

test("lists directory entries", async () => {
  await withStore((store) => {
    store.writeFile(WORKSPACE_ID, "a.txt", "1");
    store.writeFile(WORKSPACE_ID, "b.txt", "2");
    const entries = store.listDirectory(WORKSPACE_ID, ".");
    const names = entries.map((entry) => entry.name).sort();
    assert.deepEqual(names, ["a.txt", "b.txt"]);
  });
});

test("applyPatch replaces existing content", async () => {
  await withStore((store) => {
    store.writeFile(WORKSPACE_ID, "code.txt", "hello world");
    const result = store.applyPatch(WORKSPACE_ID, "code.txt", "world", "there");
    assert.equal(result.replacements, 1);
    assert.equal(store.readFile(WORKSPACE_ID, "code.txt").content, "hello there");
  });
});

test("applyPatch throws when context is missing", async () => {
  await withStore((store) => {
    store.writeFile(WORKSPACE_ID, "code.txt", "hello");
    assert.throws(() =>
      store.applyPatch(WORKSPACE_ID, "code.txt", "absent", "x")
    );
  });
});

test("moveFile relocates a file", async () => {
  await withStore((store) => {
    store.writeFile(WORKSPACE_ID, "old.txt", "data");
    store.moveFile(WORKSPACE_ID, "old.txt", "sub/new.txt");
    assert.equal(store.readFile(WORKSPACE_ID, "sub/new.txt").content, "data");
    assert.throws(() => store.readFile(WORKSPACE_ID, "old.txt"));
  });
});

test("deleteFile removes a file", async () => {
  await withStore((store) => {
    store.writeFile(WORKSPACE_ID, "gone.txt", "x");
    store.deleteFile(WORKSPACE_ID, "gone.txt");
    assert.throws(() => store.readFile(WORKSPACE_ID, "gone.txt"));
  });
});

test("searchFiles finds matching lines", async () => {
  await withStore((store) => {
    store.writeFile(WORKSPACE_ID, "doc.txt", "alpha\nbeta needle\ngamma");
    const result = store.searchFiles(WORKSPACE_ID, "needle");
    assert.equal(result.contentMatches.length, 1);
    assert.equal(result.contentMatches[0].line, 2);
    assert.match(result.contentMatches[0].text, /needle/);
    assert.equal(result.contentMatches[0].matchType, "content");
  });
});

test("searchFiles finds matching filenames", async () => {
  await withStore((store) => {
    store.writeFile(WORKSPACE_ID, "auth-service.ts", "export const x = 1;\n");
    store.writeFile(WORKSPACE_ID, "other.ts", "nope\n");
    const result = store.searchFiles(WORKSPACE_ID, "auth", {
      scope: "filename",
    });
    assert.equal(result.filenameMatches.length, 1);
    assert.equal(result.filenameMatches[0].name, "auth-service.ts");
    assert.equal(result.filenameMatches[0].matchType, "filename");
    assert.equal(result.contentMatches.length, 0);
  });
});

test("searchFiles returns filename hits before content hits", async () => {
  await withStore((store) => {
    store.writeFile(WORKSPACE_ID, "needle.txt", "plain\n");
    store.writeFile(WORKSPACE_ID, "notes.md", "has needle inside\n");
    const result = store.searchFiles(WORKSPACE_ID, "needle");
    assert.ok(result.filenameMatches.length >= 1);
    assert.ok(result.contentMatches.length >= 1);
    assert.equal(result.matches[0].matchType, "filename");
  });
});

test("rejects path traversal outside the managed root", async () => {
  await withStore((store) => {
    assert.throws(
      () => store.writeFile(WORKSPACE_ID, "../escape.txt", "x"),
      PathPolicyError
    );
  });
});

test("rejects absolute paths outside approved roots", async () => {
  await withStore((store) => {
    assert.throws(
      () => store.readFile(WORKSPACE_ID, "/etc/hostname"),
      PathPolicyError
    );
  });
});

test("creates a durable artifact with a content hash", async () => {
  await withStore((store) => {
    const artifact = store.createArtifact({
      workspaceId: WORKSPACE_ID,
      title: "Report",
      kind: "markdown",
      content: "# Title\n",
    });
    assert.equal(artifact.workspaceId, WORKSPACE_ID);
    assert.ok((artifact.contentHash ?? "").length > 0);
    assert.equal(artifact.kind, "markdown");
    assert.ok(artifact.storagePath.endsWith(".md"));
    assert.ok(artifact.mimeType.includes("markdown"));
    assert.equal(store.readArtifactByRecord(artifact), "# Title\n");
  });
});

test("maps renderable artifact kinds to extensions and mime types", async () => {
  await withStore((store) => {
    const html = store.createArtifact({
      workspaceId: WORKSPACE_ID,
      title: "Demo",
      kind: "html",
      content: "<h1>Hi</h1>",
    });
    assert.ok(html.storagePath.endsWith(".html"));
    assert.ok(html.mimeType.includes("html"));

    const svg = store.createArtifact({
      workspaceId: WORKSPACE_ID,
      title: "Icon",
      kind: "svg",
      content: '<svg xmlns="http://www.w3.org/2000/svg"></svg>',
    });
    assert.ok(svg.storagePath.endsWith(".svg"));
    assert.ok(svg.mimeType.includes("svg"));

    const mermaid = store.createArtifact({
      workspaceId: WORKSPACE_ID,
      title: "Flow",
      kind: "mermaid",
      content: "graph TD; A-->B;",
    });
    assert.ok(mermaid.storagePath.endsWith(".mmd"));
    assert.ok(mermaid.mimeType.includes("mermaid"));

    const code = store.createArtifact({
      workspaceId: WORKSPACE_ID,
      title: "Snippet",
      kind: "code",
      language: "ts",
      content: "const x = 1;\n",
    });
    assert.ok(code.storagePath.endsWith(".txt"));
    assert.ok(code.mimeType.includes("text/x-ts"));

    const json = store.createArtifact({
      workspaceId: WORKSPACE_ID,
      title: "Payload",
      kind: "data",
      content: '{"a":1}',
    });
    assert.ok(json.storagePath.endsWith(".json"));

    const csv = store.createArtifact({
      workspaceId: WORKSPACE_ID,
      title: "Table",
      kind: "data",
      content: "name,age\nAda,36\n",
    });
    assert.ok(csv.storagePath.endsWith(".csv"));
    assert.ok(csv.mimeType.includes("csv"));
  });
});

test("legacy document kind still stores as markdown", async () => {
  await withStore((store) => {
    const artifact = store.createArtifact({
      workspaceId: WORKSPACE_ID,
      title: "Legacy",
      kind: "document",
      content: "# Old\n",
    });
    assert.ok(artifact.storagePath.endsWith(".md"));
    assert.ok(artifact.mimeType.includes("markdown"));
  });
});

test("primaryRootPath falls back to the managed root without a linked primary", async () => {
  await withStore((store) => {
    assert.equal(
      store.primaryRootPath(WORKSPACE_ID),
      store.managedRootPath(WORKSPACE_ID)
    );
  });
});

test("relative paths resolve against the primary linked root", async () => {
  await withContext(({ store, database, directory }) => {
    const linkedDir = path.join(directory, "linked-root");
    mkdirSync(linkedDir, { recursive: true });
    const rootId = nanoid();
    store.ensureManagedRoot(WORKSPACE_ID);
    database.saveWorkspaceRoot({
      id: rootId,
      workspaceId: WORKSPACE_ID,
      kind: "linked",
      path: linkedDir,
      label: "Linked",
      isPrimary: false,
      createdAt: Date.now(),
    });
    database.setPrimaryWorkspaceRoot(WORKSPACE_ID, rootId);

    assert.equal(store.primaryRootPath(WORKSPACE_ID), linkedDir);

    store.writeFile(WORKSPACE_ID, "report.txt", "hello");
    assert.equal(readFileSync(path.join(linkedDir, "report.txt"), "utf8"), "hello");
  });
});

test("importFiles writes uploads and returns durable references", async () => {
  await withStore((store) => {
    const [result] = store.importFiles(WORKSPACE_ID, [
      { name: "data.csv", base64: Buffer.from("a,b\n1,2").toString("base64") },
    ]);
    assert.match(result.relativePath, /^uploads\/data\.csv$/);
    assert.equal(readFileSync(result.path, "utf8"), "a,b\n1,2");
  });
});

test("importFiles resolves name collisions", async () => {
  await withStore((store) => {
    const payload = Buffer.from("x").toString("base64");
    const [first] = store.importFiles(WORKSPACE_ID, [
      { name: "note.txt", base64: payload },
    ]);
    const [second] = store.importFiles(WORKSPACE_ID, [
      { name: "note.txt", base64: payload },
    ]);
    assert.equal(path.basename(first.path), "note.txt");
    assert.equal(path.basename(second.path), "note-1.txt");
  });
});

test("importFiles sanitizes traversal in upload names", async () => {
  await withStore((store) => {
    const [result] = store.importFiles(WORKSPACE_ID, [
      {
        name: "../../etc/passwd",
        base64: Buffer.from("x").toString("base64"),
      },
    ]);
    assert.equal(path.basename(result.path), "passwd");
    assert.equal(path.dirname(result.path), store.uploadsRootPath(WORKSPACE_ID));
  });
});

test("importFiles rejects more than the allowed count", async () => {
  await withStore((store) => {
    const many = Array.from({ length: 21 }, (_, index) => ({
      name: `f${index}.txt`,
      base64: Buffer.from("x").toString("base64"),
    }));
    assert.throws(() => store.importFiles(WORKSPACE_ID, many));
  });
});
