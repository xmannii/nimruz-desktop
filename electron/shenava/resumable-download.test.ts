import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { downloadFileWithResume } from "./resumable-download";

const encoder = new TextEncoder();

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function partialResponse(
  content: string,
  range: string
) {
  const bytes = encoder.encode(content);
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
  return new Response(body, {
    status: 206,
    headers: { "Content-Range": range },
  });
}

function droppedPartialResponse(content: string, range: string) {
  const bytes = encoder.encode(content);
  let reads = 0;
  return {
    ok: true,
    status: 206,
    headers: new Headers({ "Content-Range": range }),
    body: {
      getReader() {
        return {
          async read() {
            reads += 1;
            if (reads === 1) return { done: false as const, value: bytes };
            throw new TypeError("connection lost");
          },
          releaseLock() {},
        };
      },
    },
  } as unknown as Response;
}

test("continues a partial file and resumes again after a dropped connection", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "shenava-resume-"));
  const destination = path.join(directory, "model.onnx");
  const requestedRanges: Array<string | null> = [];
  let requests = 0;

  try {
    await writeFile(destination, "abc");
    await downloadFileWithResume({
      url: "https://example.test/model.onnx",
      destination,
      expectedBytes: 10,
      expectedSha256: sha256("abcdefghij"),
      signal: new AbortController().signal,
      baseRetryDelayMs: 0,
      wait: async () => undefined,
      fetch: async (_url, init) => {
        requestedRanges.push(new Headers(init?.headers).get("range"));
        requests += 1;
        return requests === 1
          ? droppedPartialResponse("def", "bytes 3-9/10")
          : partialResponse("ghij", "bytes 6-9/10");
      },
    });

    assert.deepEqual(requestedRanges, ["bytes=3-", "bytes=6-"]);
    assert.equal(await readFile(destination, "utf8"), "abcdefghij");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("safely restarts only the current file when a server ignores Range", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "shenava-range-"));
  const destination = path.join(directory, "tokens.txt");

  try {
    await writeFile(destination, "abc");
    await downloadFileWithResume({
      url: "https://example.test/tokens.txt",
      destination,
      expectedBytes: 6,
      expectedSha256: sha256("abcdef"),
      signal: new AbortController().signal,
      fetch: async (_url, init) => {
        assert.equal(new Headers(init?.headers).get("range"), "bytes=3-");
        return new Response("abcdef", { status: 200 });
      },
    });

    assert.equal(await readFile(destination, "utf8"), "abcdef");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("does not retry permanent HTTP errors", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "shenava-http-"));
  const destination = path.join(directory, "model.onnx");
  let requests = 0;

  try {
    await assert.rejects(
      downloadFileWithResume({
        url: "https://example.test/missing",
        destination,
        expectedBytes: 1,
        expectedSha256: sha256("a"),
        signal: new AbortController().signal,
        fetch: async () => {
          requests += 1;
          return new Response("missing", { status: 404 });
        },
      }),
      /\(404\)/
    );
    assert.equal(requests, 1);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("keeps downloaded bytes when cancelled between retry attempts", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "shenava-cancel-"));
  const destination = path.join(directory, "model.onnx");
  const controller = new AbortController();

  try {
    await writeFile(destination, "abc");
    await assert.rejects(
      downloadFileWithResume({
        url: "https://example.test/model.onnx",
        destination,
        expectedBytes: 10,
        expectedSha256: sha256("abcdefghij"),
        signal: controller.signal,
        fetch: async () => droppedPartialResponse("def", "bytes 3-9/10"),
        wait: async () => {
          controller.abort();
        },
      }),
      (error: unknown) => error instanceof Error && error.name === "AbortError"
    );
    assert.equal(await readFile(destination, "utf8"), "abcdef");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
