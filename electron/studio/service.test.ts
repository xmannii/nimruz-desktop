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
    getBflKey: () => "bfl-test-key",
    getGoogleAuth: () => ({
      apiKey: "google-test-key",
      baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    }),
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
      // The script stays verbatim; OpenRouter maps `instructions` to
      // Gemini's speech_metadata.style, which is never read aloud.
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

    // Arabic kaf/yeh and missing half-spaces still match Persian text.
    const results = service.list({ kind: "transcript", query: "اصلاحشده" });
    assert.deepEqual(
      service.list({ query: "متن خام" }).map((result) => result.id),
      [id]
    );
    assert.equal(service.list({ query: "ميتينگ" }).length, 0);
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

const GOOGLE_API = "https://generativelanguage.googleapis.com/v1beta";

test("submits Veo jobs, polls the operation, and downloads with the key header", async () => {
  let polls = 0;
  await withStudio(
    {
      [`POST ${GOOGLE_API}/models/veo-3.1-fast-generate-preview:predictLongRunning`]: () =>
        Response.json({ name: "models/veo-3.1-fast-generate-preview/operations/op-1" }),
      [`GET ${GOOGLE_API}/models/veo-3.1-fast-generate-preview/operations/op-1`]: () => {
        polls += 1;
        return Response.json(
          polls < 2
            ? { name: "op-1", done: false }
            : {
                name: "op-1",
                done: true,
                response: {
                  generateVideoResponse: {
                    generatedSamples: [
                      { video: { uri: `${GOOGLE_API}/files/abc:download?alt=media` } },
                    ],
                  },
                },
              }
        );
      },
      [`GET ${GOOGLE_API}/files/abc:download`]: (request) => {
        assert.equal(request.headers.get("x-goog-api-key"), "google-test-key");
        return new Response(new Uint8Array([1, 1, 2, 3]), {
          headers: { "Content-Type": "video/mp4" },
        });
      },
    },
    async ({ service, store, requests }) => {
      const item = await service.generateVideo({
        provider: "google",
        modelId: "veo-3.1-fast-generate-preview",
        prompt: "طلوع روی دماوند",
        aspectRatio: "16:9",
        resolution: "1080p",
        duration: 8,
        firstFrame: { type: "data-url", dataUrl: "data:image/jpeg;base64,/9j/4AAQ" },
      });
      await waitFor(() => store.get(item.id)?.status === "done");
      const body = (await requests[0].json()) as {
        instances: Array<{ prompt: string; image?: { mimeType: string } }>;
        parameters: Record<string, unknown>;
      };
      assert.equal(requests[0].headers.get("x-goog-api-key"), "google-test-key");
      assert.equal(body.instances[0].prompt, "طلوع روی دماوند");
      assert.equal(body.instances[0].image?.mimeType, "image/jpeg");
      assert.deepEqual(body.parameters, {
        sampleCount: 1,
        aspectRatio: "16:9",
        resolution: "1080p",
        durationSeconds: 8,
      });
      const done = store.get(item.id)!;
      assert.equal(done.provider, "google");
      assert.equal(done.params.jobId, "models/veo-3.1-fast-generate-preview/operations/op-1");
    }
  );
});

test("explains Veo safety filtering", async () => {
  await withStudio(
    {
      [`POST ${GOOGLE_API}/models/veo-3.1-generate-preview:predictLongRunning`]: () =>
        Response.json({ name: "models/veo-3.1-generate-preview/operations/op-2" }),
      [`GET ${GOOGLE_API}/models/veo-3.1-generate-preview/operations/op-2`]: () =>
        Response.json({
          done: true,
          response: { generateVideoResponse: { raiMediaFilteredReasons: ["Unsafe content"] } },
        }),
    },
    async ({ service, store }) => {
      const item = await service.generateVideo({
        provider: "google",
        modelId: "veo-3.1-generate-preview",
        prompt: "x",
      });
      await waitFor(() => store.get(item.id)?.status === "failed");
      assert.match(store.get(item.id)?.error ?? "", /سیاست محتوا/);
    }
  );
});

test("synthesizes Gemini TTS as WAV", async () => {
  const pcm = Buffer.alloc(48, 1).toString("base64");
  await withStudio(
    {
      [`POST ${GOOGLE_API}/models/gemini-3.1-flash-tts-preview:generateContent`]: () =>
        Response.json({
          candidates: [
            {
              content: {
                parts: [{ inlineData: { mimeType: "audio/L16;codec=pcm;rate=24000", data: pcm } }],
              },
            },
          ],
        }),
    },
    async ({ service, store, requests }) => {
      const item = await service.generateSpeech({
        provider: "google",
        modelId: "gemini-3.1-flash-tts-preview",
        voice: "Kore",
        input: "سلام",
        instructions: "گرم و آرام",
        speed: 1.5,
      });
      await waitFor(() => store.get(item.id)?.status !== "running" && store.get(item.id)?.status !== "pending");
      assert.equal(store.get(item.id)?.error, null);
      const body = JSON.stringify(await requests[0].json());
      assert.match(body, /Kore/);
      // Older preview models get the tone as a structured prompt.
      assert.match(body, /### PERFORMANCE\\nگرم و آرام/);
      assert.match(body, /#### TRANSCRIPT\\nسلام/);
      assert.doesNotMatch(body, /گرم و آرام: سلام/);
      const done = store.get(item.id)!;
      assert.equal(done.mimeType, "audio/wav");
      assert.equal(done.params.speed, null);
    }
  );
});

test("lists Google models alongside OpenRouter in the catalog", async () => {
  await withStudio(
    {
      "GET https://openrouter.ai/api/v1/models": () => Response.json({ data: [] }),
      "GET https://openrouter.ai/api/v1/videos/models": () => Response.json({ data: [] }),
      [`GET ${GOOGLE_API}/models`]: () =>
        Response.json({
          models: [
            { name: "models/imagen-4.0-generate-001", supportedGenerationMethods: ["predict"] },
            { name: "models/veo-3.1-generate-preview", supportedGenerationMethods: ["predictLongRunning"] },
          ],
        }),
      "GET https://api.elevenlabs.io/v1/models": () => Response.json([]),
      "GET https://api.elevenlabs.io/v2/voices": () => Response.json({ voices: [] }),
    },
    async ({ service }) => {
      const catalog = await service.getCatalog();
      assert.deepEqual(
        catalog.image.filter((model) => model.provider === "google").map((model) => model.id),
        ["imagen-4.0-generate-001"]
      );
      assert.ok(catalog.image.some((model) => model.provider === "bfl" && model.id === "flux-3-image"));
      assert.deepEqual(catalog.video.map((model) => model.provider), ["google", "bfl"]);
    }
  );
});

test("generates Imagen images through the Gemini API", async () => {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47]).toString("base64");
  await withStudio(
    {
      [`POST ${GOOGLE_API}/models/imagen-4.0-generate-001:predict`]: () =>
        Response.json({ predictions: [{ bytesBase64Encoded: png }] }),
    },
    async ({ service, store, requests }) => {
      const [item] = await service.generateImages({
        provider: "google",
        modelId: "imagen-4.0-generate-001",
        prompt: "کوچه‌ای در یزد",
        aspectRatio: "16:9",
        style: { id: "miniature", prompt: "Persian miniature painting" },
      });
      await waitFor(() => store.get(item.id)?.status === "done");
      assert.equal(requests[0].headers.get("x-goog-api-key"), "google-test-key");
      const sent = JSON.stringify(await requests[0].json());
      assert.match(sent, /16:9/);
      assert.match(sent, /Style: Persian miniature painting/);
      const done = store.get(item.id)!;
      assert.equal(done.provider, "google");
      // History keeps the person's own words; the preset lives in params.
      assert.equal(done.prompt, "کوچه‌ای در یزد");
      assert.equal(done.params.style, "miniature");
    }
  );
});

test("repairs Studio tables on databases stamped with a newer version", async () => {
  const { DatabaseSync } = await import("node:sqlite");
  const directory = await mkdtemp(path.join(os.tmpdir(), "nimruz-studio-skew-"));
  const file = path.join(directory, "skewed.sqlite3");
  try {
    // First open builds the full schema, then simulate an unmerged build
    // that bumped user_version and an early draft without search_text.
    new AppDatabase(file).close();
    const raw = new DatabaseSync(file);
    raw.exec("DROP TABLE studio_items; PRAGMA user_version = 13;");
    raw.exec(`CREATE TABLE studio_items (
      id TEXT PRIMARY KEY, kind TEXT NOT NULL, status TEXT NOT NULL, title TEXT NOT NULL,
      prompt TEXT NOT NULL DEFAULT '', provider TEXT NOT NULL, model_id TEXT NOT NULL,
      params_json TEXT NOT NULL DEFAULT '{}', mime_type TEXT, storage_path TEXT, text TEXT,
      corrected_text TEXT, error TEXT, cost REAL, duration_seconds REAL, parent_id TEXT,
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`);
    raw.close();

    const database = new AppDatabase(file);
    const store = new StudioStore(database.database);
    assert.deepEqual(store.list({ query: "x" }), []);
    assert.deepEqual(store.listUnfinished(), []);
    database.close();

    const missing = new DatabaseSync(file);
    missing.exec("DROP TABLE studio_items");
    missing.close();
    const reopened = new AppDatabase(file);
    assert.deepEqual(new StudioStore(reopened.database).listUnfinished(), []);
    reopened.close();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("generates FLUX images through BFL and downloads without the API key", async () => {
  let polls = 0;
  await withStudio(
    {
      "POST https://api.bfl.ai/v1/flux-2-pro": () =>
        Response.json({ id: "task-1", polling_url: "https://api.us1.bfl.ai/v1/get_result?id=task-1" }),
      "GET https://api.us1.bfl.ai/v1/get_result": () => {
        polls += 1;
        return Response.json(
          polls < 2
            ? { id: "task-1", status: "Pending" }
            : { id: "task-1", status: "Ready", cost: 3, result: { sample: "https://delivery-us1.bfl.ai/out.png?sig=1" } }
        );
      },
      "GET https://delivery-us1.bfl.ai/out.png": (request) => {
        assert.equal(request.headers.get("x-key"), null);
        return new Response(new Uint8Array([0x89, 0x50]), { headers: { "Content-Type": "image/png" } });
      },
    },
    async ({ service, store, requests }) => {
      const [item] = await service.generateImages({
        provider: "bfl",
        modelId: "flux-2-pro",
        prompt: "یک فنجان چای",
        aspectRatio: "16:9",
      });
      await waitFor(() => store.get(item.id)?.status === "done");
      assert.equal(requests[0].headers.get("x-key"), "bfl-test-key");
      const body = (await requests[0].json()) as Record<string, unknown>;
      assert.equal(body.prompt, "یک فنجان چای");
      assert.ok(Number(body.width) > Number(body.height));
      const done = store.get(item.id)!;
      assert.equal(done.provider, "bfl");
      assert.equal(done.cost, 0.03);
    }
  );
});

test("refuses BFL polling URLs outside bfl.ai", async () => {
  await withStudio(
    {
      "POST https://api.bfl.ai/v1/flux-3-video": () =>
        Response.json({ id: "x", polling_url: "https://attacker.example/steal" }),
    },
    async ({ service, store, requests }) => {
      const item = await service.generateVideo({ provider: "bfl", modelId: "flux-3-video", prompt: "x" });
      await waitFor(() => store.get(item.id)?.status === "failed");
      assert.equal(requests.length, 1);
      assert.match(store.get(item.id)?.error ?? "", /نامعتبر/);
    }
  );
});

test("summarises today's output and this month's spend", async () => {
  await withStudio({}, async ({ store, service }) => {
    const now = new Date(2026, 9, 15, 12);
    const base = {
      title: "x", prompt: "x", provider: "openrouter" as const, modelId: "a/b", params: {},
      mimeType: null, hasMedia: false, storagePath: null, text: null, correctedText: null,
      error: null, durationSeconds: null, parentId: null,
    };
    const at = (date: Date) => ({ createdAt: date.getTime(), updatedAt: date.getTime() });
    store.insert({ ...base, ...at(now), id: "a", kind: "image", status: "done", cost: 0.04 });
    store.insert({ ...base, ...at(now), id: "b", kind: "video", status: "done", cost: 1.2 });
    store.insert({ ...base, ...at(now), id: "c", kind: "image", status: "failed", cost: null });
    store.insert({ ...base, ...at(new Date(2026, 9, 3)), id: "d", kind: "image", status: "done", cost: null });
    store.insert({ ...base, ...at(new Date(2026, 8, 20)), id: "e", kind: "video", status: "done", cost: 5 });
    const stats = service.stats(now);
    assert.equal(stats.today.image, 1);
    assert.equal(stats.today.video, 1);
    assert.equal(stats.total.image, 2);
    assert.equal(stats.total.video, 2);
    assert.ok(Math.abs(stats.monthCost - 1.24) < 1e-9);
    assert.equal(stats.monthPricedCount, 2);
  });
});

test("transcribes short audio inline with Gemini and saves the audio first", async () => {
  await withStudio(
    {
      [`POST ${GOOGLE_API}/models/gemini-3-flash:generateContent`]: () =>
        Response.json({ candidates: [{ content: { parts: [{ text: "سلام، این یک آزمایش است." }] } }] }),
    },
    async ({ service, store, requests, changes }) => {
      const item = await service.transcribeRemote({
        provider: "google",
        modelId: "gemini-3-flash",
        sourceName: "voice.m4a",
        mimeType: "audio/mp4",
        audio: new Uint8Array([1, 2, 3]).buffer,
        instructions: "نام‌ها: نیمروز",
      });
      assert.equal(item.kind, "transcript");
      assert.equal(item.hasMedia, true);
      await waitFor(() => store.get(item.id)?.status === "done");
      const body = JSON.stringify(await requests[0].json());
      assert.match(body, /inline_data/);
      assert.match(body, /نیمروز/);
      assert.equal(store.get(item.id)?.text, "سلام، این یک آزمایش است.");
      assert.ok(changes.some((change) => change.id === item.id && change.status === "running"));
    }
  );
});

test("uploads long audio through the Files API and deletes it afterwards", async () => {
  const deleted: string[] = [];
  await withStudio(
    {
      [`POST https://generativelanguage.googleapis.com/upload/v1beta/files`]: (request) => {
        if (request.headers.get("x-goog-upload-command") === "start") {
          return new Response("{}", {
            headers: { "x-goog-upload-url": "https://generativelanguage.googleapis.com/upload/v1beta/files?upload_id=abc" },
          });
        }
        return Response.json({ file: { name: "files/audio-1", uri: `${GOOGLE_API}/files/audio-1`, state: "ACTIVE" } });
      },
      [`POST ${GOOGLE_API}/models/gemini-3-flash:generateContent`]: () =>
        Response.json({ candidates: [{ content: { parts: [{ text: "متن طولانی" }] } }] }),
      [`DELETE ${GOOGLE_API}/files/audio-1`]: (request) => {
        deleted.push(new URL(request.url).pathname);
        return new Response(null, { status: 200 });
      },
    },
    async ({ service, store, requests }) => {
      const big = new Uint8Array(15 * 1024 * 1024);
      const item = await service.transcribeRemote({
        provider: "google",
        modelId: "gemini-3-flash",
        sourceName: "podcast.mp3",
        mimeType: "audio/mpeg",
        audio: big.buffer,
      });
      await waitFor(() => store.get(item.id)?.status === "done", 5_000);
      const generate = requests.find((request) => request.url.includes(":generateContent"))!;
      assert.match(JSON.stringify(await generate.json()), /file_data/);
      assert.equal(store.get(item.id)?.text, "متن طولانی");
      await waitFor(() => deleted.length === 1);
    }
  );
});

test("keeps the separate instructions field for OpenAI-style TTS", async () => {
  await withStudio(
    {
      "POST https://openrouter.ai/api/v1/audio/speech": () =>
        new Response(new Uint8Array([1]), { headers: { "Content-Type": "audio/mpeg" } }),
    },
    async ({ service, store, requests }) => {
      const item = await service.generateSpeech({
        provider: "openrouter",
        modelId: "openai/gpt-4o-mini-tts",
        voice: "alloy",
        input: "Hello there",
        instructions: "warm and calm",
      });
      await waitFor(() => store.get(item.id)?.status === "done");
      const body = (await requests[0].json()) as Record<string, unknown>;
      assert.equal(body.input, "Hello there");
      assert.equal(body.instructions, "warm and calm");
    }
  );
});

test("sends Gemini 3.8 tone as speech_metadata.style, never in the text", async () => {
  const pcm = Buffer.alloc(32, 2).toString("base64");
  await withStudio(
    {
      [`POST ${GOOGLE_API}/models/gemini-3.8-flash-tts:generateContent`]: () =>
        Response.json({
          candidates: [{ content: { parts: [{ inlineData: { mimeType: "audio/L16;codec=pcm;rate=24000", data: pcm } }] } }],
        }),
    },
    async ({ service, store, requests }) => {
      const item = await service.generateSpeech({
        provider: "google",
        modelId: "gemini-3.8-flash-tts",
        voice: "Kore",
        input: "سلام",
        instructions: "مثل یک قصه‌گو",
      });
      await waitFor(() => store.get(item.id)?.status === "done");
      const body = (await requests[0].json()) as {
        contents: Array<{ parts: Array<{ text: string; speech_metadata?: { style: string } }> }>;
      };
      assert.deepEqual(body.contents[0].parts[0], {
        text: "سلام",
        speech_metadata: { style: "مثل یک قصه‌گو" },
      });
      assert.equal(store.get(item.id)?.mimeType, "audio/wav");
    }
  );
});
