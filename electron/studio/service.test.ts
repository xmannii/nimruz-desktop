import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import type { StudioItem } from "@/lib/studio/types";
import { AppDatabase } from "../storage/database";
import { parseByteRange, StudioService } from "./service";
import { StudioStore } from "./store";

type Route = (request: Request) => Response | Promise<Response>;

async function withStudio(
  routes: Record<string, Route>,
  operation: (context: {
    service: StudioService;
    store: StudioStore;
    changes: StudioItem[];
    requests: Request[];
    mediaDirectory: string;
  }) => Promise<void>
) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "nimruz-studio-"));
  const database = new AppDatabase(path.join(directory, "test.sqlite3"));
  const store = new StudioStore(database.database);
  const changes: StudioItem[] = [];
  const requests: Request[] = [];
  const mediaDirectory = path.join(directory, "studio");
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    requests.push(request.clone());
    const url = new URL(request.url);
    const key = `${request.method} ${url.origin}${url.pathname}`;
    const route = routes[key];
    if (!route) return new Response("missing route", { status: 404 });
    return route(request);
  }) as typeof fetch;
  const service = new StudioService({
    store,
    mediaDirectory,
    getOpenRouterKey: () => "sk-or-test-key",
    getElevenLabsKey: () => "eleven-test-key",
    onItemChange: (item) => changes.push(item),
    onItemDelete: () => undefined,
    fetchImpl,
    videoPollIntervalMs: 5,
  });
  try {
    await service.initialize();
    await operation({ service, store, changes, requests, mediaDirectory });
  } finally {
    service.dispose();
    database.close();
    await rm(directory, { recursive: true, force: true });
  }
}

async function waitFor(predicate: () => boolean, timeoutMs = 2_000) {
  const startedAt = Date.now();
  while (!predicate()) {
    if (Date.now() - startedAt > timeoutMs) throw new Error("Timed out waiting.");
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

test("parses single byte ranges for media seeking", () => {
  assert.equal(parseByteRange(null, 100), null);
  assert.deepEqual(parseByteRange("bytes=0-9", 100), { start: 0, end: 9 });
  assert.deepEqual(parseByteRange("bytes=90-", 100), { start: 90, end: 99 });
  assert.deepEqual(parseByteRange("bytes=-10", 100), { start: 90, end: 99 });
  assert.deepEqual(parseByteRange("bytes=50-500", 100), { start: 50, end: 99 });
  assert.equal(parseByteRange("bytes=100-", 100), "invalid");
  assert.equal(parseByteRange("bytes=0-1,5-6", 100), null);
});

test("generates OpenRouter speech and serves it with range requests", async () => {
  await withStudio(
    {
      "POST https://openrouter.ai/api/v1/audio/speech": () =>
        new Response(new Uint8Array([1, 2, 3, 4, 5, 6]), {
          headers: { "Content-Type": "audio/mpeg" },
        }),
    },
    async ({ service, requests, store }) => {
      const item = await service.generateSpeech({
        provider: "openrouter",
        modelId: "google/gemini-tts",
        voice: "Kore",
        input: "سلام دنیا",
        instructions: "آرام بخوان",
      });
      assert.equal(item.status, "pending");
      await waitFor(() => store.get(item.id)?.status === "done");

      const body = (await requests[0].json()) as Record<string, unknown>;
      assert.equal(requests[0].headers.get("authorization"), "Bearer sk-or-test-key");
      assert.deepEqual(body, {
        model: "google/gemini-tts",
        input: "سلام دنیا",
        response_format: "mp3",
        voice: "Kore",
        instructions: "آرام بخوان",
      });

      const full = await service.handleMediaRequest(
        new Request(`nimruz-media://item/${item.id}`)
      );
      assert.equal(full.status, 200);
      assert.equal(full.headers.get("content-type"), "audio/mpeg");
      assert.deepEqual(new Uint8Array(await full.arrayBuffer()), new Uint8Array([1, 2, 3, 4, 5, 6]));

      const partial = await service.handleMediaRequest(
        new Request(`nimruz-media://item/${item.id}`, { headers: { Range: "bytes=2-3" } })
      );
      assert.equal(partial.status, 206);
      assert.equal(partial.headers.get("content-range"), "bytes 2-3/6");
      assert.deepEqual(new Uint8Array(await partial.arrayBuffer()), new Uint8Array([3, 4]));

      const missing = await service.handleMediaRequest(
        new Request("nimruz-media://item/does-not-exist")
      );
      assert.equal(missing.status, 404);
      const traversal = await service.handleMediaRequest(
        new Request("nimruz-media://item/..%2F..%2Fsecret")
      );
      assert.equal(traversal.status, 400);
    }
  );
});

test("sends ElevenLabs requests with the voice in the path", async () => {
  await withStudio(
    {
      "POST https://api.elevenlabs.io/v1/text-to-speech/JBFqnCBsd6RMkjVDRZzb": () =>
        new Response(new Uint8Array([9, 9]), { headers: { "Content-Type": "audio/mpeg" } }),
    },
    async ({ service, requests, store }) => {
      const item = await service.generateSpeech({
        provider: "elevenlabs",
        modelId: "eleven_v3",
        voice: "JBFqnCBsd6RMkjVDRZzb",
        input: "Hello",
      });
      await waitFor(() => store.get(item.id)?.status === "done");
      assert.equal(requests[0].headers.get("xi-api-key"), "eleven-test-key");
      assert.deepEqual(await requests[0].json(), { text: "Hello", model_id: "eleven_v3" });
    }
  );
});

test("records provider errors on the item", async () => {
  await withStudio(
    {
      "POST https://openrouter.ai/api/v1/audio/speech": () =>
        Response.json({ error: { message: "Insufficient credits" } }, { status: 402 }),
    },
    async ({ service, store }) => {
      const item = await service.generateSpeech({
        provider: "openrouter",
        modelId: "openai/tts",
        voice: "alloy",
        input: "Hi",
      });
      await waitFor(() => store.get(item.id)?.status === "failed");
      assert.match(store.get(item.id)?.error ?? "", /اعتبار/);
    }
  );
});

test("submits, polls, and downloads OpenRouter videos", async () => {
  let polls = 0;
  await withStudio(
    {
      "POST https://openrouter.ai/api/v1/videos": () =>
        Response.json({ id: "job-1", polling_url: "x", status: "pending" }, { status: 202 }),
      "GET https://openrouter.ai/api/v1/videos/job-1": () => {
        polls += 1;
        return Response.json(
          polls < 2
            ? { id: "job-1", status: "in_progress", polling_url: "x" }
            : {
                id: "job-1",
                status: "completed",
                polling_url: "x",
                unsigned_urls: ["https://openrouter.ai/api/v1/videos/job-1/content?index=0"],
                usage: { cost: 1.25 },
              }
        );
      },
      "GET https://openrouter.ai/api/v1/videos/job-1/content": (request) => {
        assert.equal(request.headers.get("authorization"), "Bearer sk-or-test-key");
        return new Response(new Uint8Array([0, 0, 0, 24]), {
          headers: { "Content-Type": "video/mp4" },
        });
      },
    },
    async ({ service, store, requests, mediaDirectory, changes }) => {
      const item = await service.generateVideo({
        modelId: "google/veo-3.1",
        prompt: "A cat surfing",
        aspectRatio: "16:9",
        resolution: "720p",
        duration: 4,
        generateAudio: false,
        firstFrame: { type: "data-url", dataUrl: "data:image/png;base64,iVBORw0KGgo=" },
      });
      await waitFor(() => store.get(item.id)?.status === "done");
      const submitted = (await requests[0].json()) as Record<string, unknown>;
      assert.equal(submitted.aspect_ratio, "16:9");
      assert.equal(submitted.resolution, "720p");
      assert.equal(submitted.duration, 4);
      assert.equal(submitted.generate_audio, false);
      assert.equal(
        (submitted.frame_images as Array<{ frame_type: string }>)[0].frame_type,
        "first_frame"
      );

      const done = store.get(item.id)!;
      assert.equal(done.params.jobId, "job-1");
      assert.equal(done.cost, 1.25);
      assert.equal(done.mimeType, "video/mp4");
      assert.ok(changes.some((change) => change.id === item.id && change.status === "running"));
      assert.deepEqual(
        new Uint8Array(await readFile(path.join(mediaDirectory, `${item.id}.mp4`))),
        new Uint8Array([0, 0, 0, 24])
      );
    }
  );
});

test("persists transcripts with audio and AI corrections", async () => {
  await withStudio({}, async ({ service, mediaDirectory }) => {
    const id = "transcript-1";
    const item = await service.saveTranscript({
      id,
      sourceName: "meeting.m4a",
      modelKey: "rizeh",
      text: "متن خام",
      durationSeconds: 61,
      mimeType: "audio/mp4",
      audio: new Uint8Array([7, 7, 7]).buffer,
    });
    assert.equal(item.kind, "transcript");
    assert.equal(item.hasMedia, true);
    assert.equal(item.title, "meeting.m4a");
    assert.equal(service.suggestedFileName(id), "meeting.m4a");
    assert.ok((await readFile(path.join(mediaDirectory, `${id}.m4a`))).byteLength === 3);

    const corrected = service.updateTranscript(id, { correctedText: "متن اصلاح‌شده" });
    assert.equal(corrected?.correctedText, "متن اصلاح‌شده");

    const results = service.list({ kind: "transcript", query: "اصلاح" });
    assert.deepEqual(results.map((result) => result.id), [id]);
    assert.equal(service.list({ kind: "image" }).length, 0);

    await service.delete(id);
    assert.equal(service.get(id), null);
    await assert.rejects(readFile(path.join(mediaDirectory, `${id}.m4a`)));
  });
});

test("marks unfinished non-video work as interrupted on startup", async () => {
  await withStudio({}, async ({ store, service }) => {
    store.insert({
      id: "stale-image",
      kind: "image",
      status: "running",
      title: "stale",
      prompt: "stale",
      provider: "openrouter",
      modelId: "a/b",
      params: {},
      mimeType: null,
      hasMedia: false,
      storagePath: null,
      text: null,
      correctedText: null,
      error: null,
      cost: null,
      durationSeconds: null,
      parentId: null,
      createdAt: 1,
      updatedAt: 1,
    });
    await service.initialize();
    assert.equal(store.get("stale-image")?.status, "interrupted");
  });
});

test("rejects invalid input before creating items", async () => {
  await withStudio({}, async ({ service, store }) => {
    await assert.rejects(
      service.generateImages({ modelId: "bad model", prompt: "x" }),
      /مدل/
    );
    await assert.rejects(
      service.generateImages({ modelId: "a/b", prompt: "   " }),
      /خالی/
    );
    await assert.rejects(
      service.generateImages({
        modelId: "a/b",
        prompt: "x",
        references: [{ type: "data-url", dataUrl: "data:text/html;base64,PHA+" }],
      }),
      /مرجع/
    );
    assert.equal(store.list().length, 0);
  });
});
