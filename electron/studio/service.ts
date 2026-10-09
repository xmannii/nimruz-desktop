import { createReadStream } from "node:fs";
import { mkdir, rm, stat, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { randomUUID } from "node:crypto";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateImage, generateSpeech } from "ai";
import { APP_NAME } from "@/lib/branding";
import {
  parseElevenLabsModels,
  parseElevenLabsVoices,
  parseGoogleModels,
  parseOpenRouterImageModels,
  parseOpenRouterSpeechModels,
  parseOpenRouterVideoModels,
} from "@/lib/studio/catalog";
import { mediaExtension, studioItemTitle } from "@/lib/studio/format";
import {
  STUDIO_LIMITS,
  type StudioImageInput,
  type StudioImageRequest,
  type StudioItem,
  type StudioListOptions,
  type StudioMediaProvider,
  type StudioModelCatalog,
  type StudioSpeechModel,
  type StudioSpeechRequest,
  type StudioTranscriptInput,
  type StudioTranscriptPatch,
  type StudioProvider,
  type StudioRemoteTranscriptionRequest,
  type StudioVideoRequest,
} from "@/lib/studio/types";
import {
  BFL_API,
  BFL_IMAGE_MODELS,
  BFL_VIDEO_MODELS,
  buildBflImageBody,
  buildBflVideoBody,
  isBflApiUrl,
  parseBflPoll,
} from "./bfl";
import {
  deleteGeminiFile,
  GEMINI_INLINE_AUDIO_BYTES,
  GeminiAudioError,
  transcribeWithGemini,
  uploadGeminiFile,
} from "./gemini-audio";
import {
  isStudioItemId,
  StudioStore,
  toPublicStudioItem,
  type StudioItemPatch,
  type StudioItemRecord,
} from "./store";

const OPENROUTER_API = "https://openrouter.ai/api/v1";
const ELEVENLABS_API = "https://api.elevenlabs.io";
const CATALOG_TTL_MS = 10 * 60 * 1000;
const VIDEO_POLL_INTERVAL_MS = 5_000;
const VIDEO_MAX_POLL_MS = 30 * 60 * 1000;
const MAX_DOWNLOAD_BYTES = 512 * 1024 * 1024;

const IMAGE_DATA_URL = /^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/=]+)$/;
const ASPECT_RATIO = /^\d{1,2}:\d{1,2}$/;

type FetchLike = typeof fetch;

export type ProviderAuth = { apiKey: string; baseUrl: string };

export type StudioServiceOptions = {
  store: StudioStore;
  mediaDirectory: string;
  getOpenRouterKey: () => string | null;
  getGoogleAuth: () => ProviderAuth | null;
  getElevenLabsKey: () => string | null;
  getBflKey?: () => string | null;
  onItemChange: (item: StudioItem) => void;
  onItemDelete: (id: string) => void;
  fetchImpl?: FetchLike;
  videoPollIntervalMs?: number;
};

export class StudioError extends Error {}

function trimmed(value: unknown, max: number, label: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new StudioError(`${label} نمی‌تواند خالی باشد.`);
  }
  const text = value.trim();
  if (text.length > max) {
    throw new StudioError(`${label} بیش از حد طولانی است.`);
  }
  return text;
}

function modelId(value: unknown) {
  if (typeof value !== "string" || !/^[\w.:/-]{1,200}$/.test(value)) {
    throw new StudioError("مدل انتخاب‌شده نامعتبر است.");
  }
  return value;
}

function optionalAspectRatio(value: unknown) {
  return typeof value === "string" && ASPECT_RATIO.test(value)
    ? (value as `${number}:${number}`)
    : undefined;
}

/** Validates a preset and returns the text sent to the model. */
function applyStyle(prompt: string, style: unknown) {
  if (!style || typeof style !== "object") return { modelPrompt: prompt, params: {} };
  const { id, prompt: fragment } = style as { id?: unknown; prompt?: unknown };
  if (
    typeof id !== "string" ||
    !/^[\w-]{1,40}$/.test(id) ||
    typeof fragment !== "string" ||
    !fragment.trim()
  ) {
    return { modelPrompt: prompt, params: {} };
  }
  const text = fragment.trim().slice(0, 400);
  return {
    modelPrompt: `${prompt}\n\nStyle: ${text}`,
    params: { style: id, stylePrompt: text },
  };
}

function mediaProvider(value: unknown): StudioMediaProvider {
  return value === "google" || value === "bfl" ? value : "openrouter";
}

function missingKeyMessage(provider: StudioProvider) {
  if (provider === "google") return "کلید Google AI Studio تنظیم نشده است.";
  if (provider === "bfl") return "کلید Black Forest Labs تنظیم نشده است.";
  if (provider === "elevenlabs") return "کلید ElevenLabs تنظیم نشده است.";
  return "کلید OpenRouter تنظیم نشده است. آن را در تنظیمات وارد کنید.";
}

function errorMessage(error: unknown) {
  if (error instanceof StudioError) return error.message;
  if (error instanceof GeminiAudioError && error.statusCode === undefined) return error.message;
  const status =
    error && typeof error === "object" && "statusCode" in error
      ? Number((error as { statusCode?: unknown }).statusCode)
      : null;
  const raw = error instanceof Error ? error.message : String(error ?? "");
  if (status === 401 || /unauthori[sz]ed|invalid api key/i.test(raw)) {
    return "کلید API نامعتبر است یا دسترسی ندارد.";
  }
  if (status === 402 || /insufficient|credits/i.test(raw)) {
    return "اعتبار حساب برای این درخواست کافی نیست.";
  }
  if (status === 429 || /rate limit/i.test(raw)) {
    return "تعداد درخواست‌ها زیاد است؛ کمی بعد دوباره تلاش کنید.";
  }
  if (/fetch failed|ENOTFOUND|ECONNREFUSED|ETIMEDOUT/i.test(raw)) {
    return "اتصال به سرویس برقرار نشد. اینترنت یا پراکسی را بررسی کنید.";
  }
  return raw.slice(0, 500) || "درخواست ناموفق بود.";
}

async function readErrorBody(response: Response) {
  const body = await response.text().catch(() => "");
  try {
    const parsed = JSON.parse(body) as {
      error?: { message?: unknown } | string;
      detail?: { message?: unknown } | string;
    };
    const candidate =
      typeof parsed.error === "string"
        ? parsed.error
        : typeof parsed.error?.message === "string"
          ? parsed.error.message
          : typeof parsed.detail === "string"
            ? parsed.detail
            : typeof parsed.detail?.message === "string"
              ? parsed.detail.message
              : null;
    if (candidate) return candidate;
  } catch {
    // Non-JSON error bodies fall through to the raw text.
  }
  return body.slice(0, 300) || response.statusText;
}

async function ensureOk(response: Response) {
  if (response.ok) return response;
  const message = await readErrorBody(response);
  throw Object.assign(new Error(message), { statusCode: response.status });
}

function delay(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason);
      return;
    }
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

async function readLimited(response: Response, limit = MAX_DOWNLOAD_BYTES) {
  const length = Number(response.headers.get("content-length"));
  if (Number.isFinite(length) && length > limit) {
    throw new StudioError("فایل خروجی بیش از حد بزرگ است.");
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.byteLength > limit) {
    throw new StudioError("فایل خروجی بیش از حد بزرگ است.");
  }
  return buffer;
}

type ByteRange = { start: number; end: number };

/** Parses a single `bytes=` range; multi-range requests fall back to full. */
export function parseByteRange(header: string | null, size: number): ByteRange | null | "invalid" {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return null;
  const [, rawStart, rawEnd] = match;
  if (!rawStart && !rawEnd) return "invalid";
  let start: number;
  let end: number;
  if (!rawStart) {
    const suffix = Number(rawEnd);
    if (suffix <= 0) return "invalid";
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(rawStart);
    end = rawEnd ? Math.min(Number(rawEnd), size - 1) : size - 1;
  }
  if (start >= size || start > end) return "invalid";
  return { start, end };
}

export class StudioService {
  private readonly store: StudioStore;
  private readonly mediaDirectory: string;
  private readonly fetch: FetchLike;
  private readonly controllers = new Map<string, AbortController>();
  private catalog: StudioModelCatalog | null = null;
  private catalogRequest: Promise<StudioModelCatalog> | null = null;
  private elevenLabsModels: StudioSpeechModel[] | null = null;
  private googleCatalog: ReturnType<typeof parseGoogleModels> | null = null;

  constructor(private readonly options: StudioServiceOptions) {
    this.store = options.store;
    this.mediaDirectory = path.resolve(options.mediaDirectory);
    this.fetch = options.fetchImpl ?? fetch;
  }

  /** Resumes video polling and marks other in-flight work as interrupted. */
  async initialize() {
    await mkdir(this.mediaDirectory, { recursive: true });
    for (const item of this.store.listUnfinished()) {
      const jobId = typeof item.params.jobId === "string" ? item.params.jobId : null;
      if (
        item.kind === "video" &&
        jobId &&
        (item.provider === "openrouter" || item.provider === "google" || item.provider === "bfl") &&
        this.runVideoJob(item.id, item.provider, jobId)
      ) {
        continue;
      }
      this.patch(item.id, {
        status: "interrupted",
        error: "برنامه پیش از پایان این کار بسته شد.",
      });
    }
  }

  dispose() {
    for (const controller of this.controllers.values()) controller.abort();
    this.controllers.clear();
  }

  list(options: StudioListOptions = {}): StudioItem[] {
    return this.store.list(options).map(toPublicStudioItem);
  }

  stats(now = new Date()) {
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    const month = new Date(today);
    month.setDate(1);
    return this.store.stats(today.getTime(), month.getTime());
  }

  get(id: string): StudioItem | null {
    const record = this.store.get(id);
    return record ? toPublicStudioItem(record) : null;
  }

  /** Absolute media path for a finished item, guarded to the media folder. */
  mediaPath(id: string): string | null {
    const record = this.store.get(id);
    if (!record?.storagePath) return null;
    const resolved = path.resolve(this.mediaDirectory, record.storagePath);
    if (path.dirname(resolved) !== this.mediaDirectory) return null;
    return resolved;
  }

  async delete(id: string) {
    if (!isStudioItemId(id)) return;
    this.controllers.get(id)?.abort();
    const file = this.mediaPath(id);
    this.store.delete(id);
    if (file) await rm(file, { force: true });
    this.options.onItemDelete(id);
  }

  cancel(id: string) {
    const controller = this.controllers.get(id);
    if (!controller) return;
    controller.abort();
    this.patch(id, { status: "failed", error: "به درخواست شما لغو شد." });
  }

  // MARK: Catalog

  async getCatalog(force = false): Promise<StudioModelCatalog> {
    if (force) {
      this.googleCatalog = null;
      this.elevenLabsModels = null;
    }
    if (
      force ||
      !this.catalog ||
      Date.now() - this.catalog.fetchedAt >= CATALOG_TTL_MS
    ) {
      this.catalogRequest ??= this.fetchCatalog().finally(() => {
        this.catalogRequest = null;
      });
      try {
        this.catalog = await this.catalogRequest;
      } catch (error) {
        if (!this.catalog) {
          // OpenRouter being unreachable should not hide direct providers.
          this.catalog = { image: [], video: [], speech: [], transcription: [], fetchedAt: 0 };
          const fallback = await this.withConnections(this.catalog);
          if (
            fallback.image.length + fallback.video.length + fallback.speech.length + fallback.transcription.length === 0
          ) {
            this.catalog = null;
            throw new StudioError(errorMessage(error));
          }
          return fallback;
        }
      }
    }
    return this.withConnections(this.catalog!);
  }

  invalidateConnection(connection: "google" | "bfl" | "elevenlabs") {
    if (connection === "google") this.googleCatalog = null;
    else if (connection === "elevenlabs") this.elevenLabsModels = null;
    // BFL models are a static list; nothing to refresh.
  }

  private async withConnections(catalog: StudioModelCatalog) {
    const [google, eleven] = await Promise.all([
      this.loadGoogleCatalog().catch(() => null),
      this.loadElevenLabsModels().catch(() => []),
    ]);
    const bfl = this.options.getBflKey?.() ? { image: BFL_IMAGE_MODELS, video: BFL_VIDEO_MODELS } : null;
    return {
      ...catalog,
      image: [...(google?.image ?? []), ...(bfl?.image ?? []), ...catalog.image],
      video: [...(google?.video ?? []), ...(bfl?.video ?? []), ...catalog.video],
      speech: [...(google?.speech ?? []), ...eleven, ...catalog.speech],
      transcription: [...(google?.transcription ?? []), ...catalog.transcription],
    };
  }

  private async fetchCatalog(): Promise<StudioModelCatalog> {
    const json = async (url: string) => {
      const response = await ensureOk(
        await this.fetch(url, { signal: AbortSignal.timeout(20_000) })
      );
      return response.json() as Promise<unknown>;
    };
    const [image, video, speech] = await Promise.all([
      json(`${OPENROUTER_API}/models?output_modalities=image`),
      json(`${OPENROUTER_API}/videos/models`),
      json(`${OPENROUTER_API}/models?output_modalities=speech`),
    ]);
    return {
      image: parseOpenRouterImageModels(image),
      video: parseOpenRouterVideoModels(video),
      speech: parseOpenRouterSpeechModels(speech),
      transcription: [],
      fetchedAt: Date.now(),
    };
  }

  private async loadGoogleCatalog() {
    const auth = this.options.getGoogleAuth();
    if (!auth) return null;
    if (this.googleCatalog) return this.googleCatalog;
    const response = await ensureOk(
      await this.fetch(`${auth.baseUrl}/models?pageSize=1000`, {
        headers: { "x-goog-api-key": auth.apiKey },
        signal: AbortSignal.timeout(20_000),
      })
    );
    this.googleCatalog = parseGoogleModels(await response.json());
    return this.googleCatalog;
  }

  private async loadElevenLabsModels(): Promise<StudioSpeechModel[]> {
    const apiKey = this.options.getElevenLabsKey();
    if (!apiKey) return [];
    if (this.elevenLabsModels) return this.elevenLabsModels;
    const headers = { "xi-api-key": apiKey };
    const [modelsResponse, voicesResponse] = await Promise.all([
      this.fetch(`${ELEVENLABS_API}/v1/models`, {
        headers,
        signal: AbortSignal.timeout(20_000),
      }).then(ensureOk),
      this.fetch(`${ELEVENLABS_API}/v2/voices?page_size=100`, {
        headers,
        signal: AbortSignal.timeout(20_000),
      }).then(ensureOk),
    ]);
    const voices = parseElevenLabsVoices(await voicesResponse.json());
    this.elevenLabsModels = parseElevenLabsModels(
      await modelsResponse.json(),
      voices
    );
    return this.elevenLabsModels;
  }

  // MARK: Generation

  async generateImages(request: StudioImageRequest): Promise<StudioItem[]> {
    const provider = mediaProvider(request.provider);
    const auth = this.requireAuth(provider);
    const model = modelId(request.modelId);
    const prompt = trimmed(request.prompt, STUDIO_LIMITS.prompt, "متن درخواست");
    const style = applyStyle(prompt, request.style);
    const aspectRatio = optionalAspectRatio(request.aspectRatio);
    const count = Math.min(
      Math.max(1, Math.trunc(request.count ?? 1)),
      STUDIO_LIMITS.maxImagesPerRequest
    );
    const references = (request.references ?? []).slice(
      0,
      STUDIO_LIMITS.maxReferenceImages
    );
    const referenceImages = await Promise.all(
      references.map((input) => this.resolveImageInput(input))
    );
    const referenceItemIds = references.flatMap((input) =>
      input.type === "item" ? [input.itemId] : []
    );
    const parentId =
      request.parentId && this.store.get(request.parentId)
        ? request.parentId
        : referenceItemIds[0] ?? null;

    const batchId = randomUUID();
    const records = Array.from({ length: count }, (_, index) =>
      this.insert({
        kind: "image",
        provider,
        modelId: model,
        prompt,
        parentId,
        params: {
          aspectRatio: aspectRatio ?? null,
          batchId,
          batchIndex: index,
          batchSize: count,
          referenceCount: referenceImages.length,
          referenceItemIds,
          ...style.params,
        },
      })
    );

    if (provider === "bfl") {
      for (const record of records) {
        void this.track(record.id, async (signal) => {
          this.patch(record.id, { status: "running" });
          const pollingUrl = await this.submitBfl(auth.apiKey, model, signal, buildBflImageBody({
            modelId: model,
            prompt: style.modelPrompt,
            aspectRatio,
            references: referenceImages.map((image) => image.dataUrl),
          }));
          const ready = await this.waitForBfl(pollingUrl, auth.apiKey, signal, 1_000, 5 * 60 * 1000);
          const download = await ensureOk(await this.fetch(ready.url, { signal }));
          const mimeType = download.headers.get("content-type")?.split(";")[0] || "image/png";
          await this.saveMedia(
            record.id,
            await readLimited(download, 64 * 1024 * 1024),
            mimeType.startsWith("image/") ? mimeType : "image/png",
            ready.cost !== null ? { cost: ready.cost } : {}
          );
        });
      }
      return records.map(toPublicStudioItem);
    }

    const imageModel =
      provider === "google"
        ? createGoogleGenerativeAI({
            apiKey: auth.apiKey,
            baseURL: auth.baseUrl,
            fetch: this.fetch,
          }).image(model)
        : createOpenRouter({
            apiKey: auth.apiKey,
            appName: APP_NAME,
            fetch: this.fetch,
          }).imageModel(model);
    for (const record of records) {
      void this.track(record.id, async (signal) => {
        this.patch(record.id, { status: "running" });
        const result = await generateImage({
          model: imageModel,
          prompt:
            referenceImages.length > 0
              ? { text: style.modelPrompt, images: referenceImages.map((image) => image.data) }
              : style.modelPrompt,
          n: 1,
          aspectRatio,
          abortSignal: signal,
          maxRetries: 1,
        });
        const image = result.images[0];
        if (!image) throw new StudioError("مدل تصویری برنگرداند.");
        const mimeType = image.mediaType || "image/png";
        await this.saveMedia(record.id, Buffer.from(image.uint8Array), mimeType);
      });
    }
    return records.map(toPublicStudioItem);
  }

  async generateVideo(request: StudioVideoRequest): Promise<StudioItem> {
    const provider = mediaProvider(request.provider);
    const auth = this.requireAuth(provider);
    const model = modelId(request.modelId);
    const prompt = trimmed(request.prompt, STUDIO_LIMITS.prompt, "متن درخواست");
    const style = applyStyle(prompt, request.style);
    const aspectRatio = optionalAspectRatio(request.aspectRatio);
    const resolution =
      typeof request.resolution === "string" && /^[\w]{2,8}$/.test(request.resolution)
        ? request.resolution
        : undefined;
    const duration =
      Number.isInteger(request.duration) && request.duration! > 0 && request.duration! <= 60
        ? request.duration
        : undefined;
    const firstFrame = request.firstFrame
      ? await this.resolveImageInput(request.firstFrame)
      : null;
    const parentId =
      request.firstFrame?.type === "item" ? request.firstFrame.itemId : null;

    const record = this.insert({
      kind: "video",
      provider,
      modelId: model,
      prompt,
      parentId,
      params: {
        aspectRatio: aspectRatio ?? null,
        resolution: resolution ?? null,
        duration: duration ?? null,
        generateAudio: request.generateAudio ?? null,
        hasFirstFrame: Boolean(firstFrame),
        jobId: null,
        ...style.params,
      },
    });

    void this.track(record.id, async (signal) => {
      const jobId =
        provider === "bfl"
          ? await this.submitBfl(auth.apiKey, model, signal, buildBflVideoBody({
              prompt: style.modelPrompt,
              aspectRatio,
              resolution,
              duration,
              generateAudio: request.generateAudio,
              firstFrame: firstFrame?.dataUrl ?? null,
            }))
          : provider === "google"
          ? await this.submitGoogleVideo(auth, signal, {
              model,
              prompt: style.modelPrompt,
              aspectRatio,
              resolution,
              duration,
              firstFrame,
            })
          : await this.submitOpenRouterVideo(auth.apiKey, signal, {
              model,
              prompt: style.modelPrompt,
              aspectRatio,
              resolution,
              duration,
              generateAudio: request.generateAudio,
              firstFrame,
            });
      const current = this.store.get(record.id);
      this.patch(record.id, {
        status: "running",
        params: { ...(current?.params ?? {}), jobId },
      });
      await this.pollVideo(record.id, provider, jobId, auth, signal);
    });

    return toPublicStudioItem(record);
  }

  /** Submits a BFL job and returns its polling URL (a BFL host, checked). */
  private async submitBfl(
    apiKey: string,
    model: string,
    signal: AbortSignal,
    body: Record<string, unknown>
  ) {
    const response = await ensureOk(
      await this.fetch(`${BFL_API}/v1/${encodeURIComponent(model)}`, {
        method: "POST",
        signal,
        headers: { "x-key": apiKey, "Content-Type": "application/json", accept: "application/json" },
        body: JSON.stringify(body),
      })
    );
    const submitted = (await response.json()) as { polling_url?: unknown };
    if (!isBflApiUrl(submitted.polling_url)) {
      throw new StudioError("پاسخ نامعتبر از Black Forest Labs دریافت شد.");
    }
    return submitted.polling_url;
  }

  /** One poll; the signed result URL is fetched without the API key. */
  private async pollBflOnce(pollingUrl: string, apiKey: string, signal: AbortSignal) {
    if (!isBflApiUrl(pollingUrl)) throw new StudioError("آدرس پیگیری نامعتبر است.");
    const response = await ensureOk(
      await this.fetch(pollingUrl, { headers: { "x-key": apiKey, accept: "application/json" }, signal })
    );
    const result = parseBflPoll(await response.json());
    if (result.state === "failed") throw new StudioError(result.message);
    if (result.state === "pending") return null;
    return { url: result.url, headers: {}, cost: result.cost };
  }

  private async waitForBfl(
    pollingUrl: string,
    apiKey: string,
    signal: AbortSignal,
    intervalMs: number,
    timeoutMs: number
  ) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      await delay(this.options.videoPollIntervalMs ?? intervalMs, signal);
      const result = await this.pollBflOnce(pollingUrl, apiKey, signal);
      if (result) return result;
    }
    throw new StudioError("ساخت تصویر بیش از حد طول کشید.");
  }

  private async submitOpenRouterVideo(
    apiKey: string,
    signal: AbortSignal,
    input: {
      model: string;
      prompt: string;
      aspectRatio?: string;
      resolution?: string;
      duration?: number;
      generateAudio?: boolean;
      firstFrame: { dataUrl: string } | null;
    }
  ) {
    const response = await ensureOk(
      await this.fetch(`${OPENROUTER_API}/videos`, {
        method: "POST",
        headers: this.openRouterHeaders(apiKey),
        signal,
        body: JSON.stringify({
          model: input.model,
          prompt: input.prompt,
          ...(input.aspectRatio ? { aspect_ratio: input.aspectRatio } : {}),
          ...(input.resolution ? { resolution: input.resolution } : {}),
          ...(input.duration ? { duration: input.duration } : {}),
          ...(typeof input.generateAudio === "boolean"
            ? { generate_audio: input.generateAudio }
            : {}),
          ...(input.firstFrame
            ? {
                frame_images: [{
                  type: "image_url",
                  image_url: { url: input.firstFrame.dataUrl },
                  frame_type: "first_frame",
                }],
              }
            : {}),
        }),
      })
    );
    const submitted = (await response.json()) as { id?: unknown };
    if (typeof submitted.id !== "string" || !/^[\w-]{1,200}$/.test(submitted.id)) {
      throw new StudioError("پاسخ نامعتبر از سرویس ویدیو دریافت شد.");
    }
    return submitted.id;
  }

  private async submitGoogleVideo(
    auth: ProviderAuth,
    signal: AbortSignal,
    input: {
      model: string;
      prompt: string;
      aspectRatio?: string;
      resolution?: string;
      duration?: number;
      firstFrame: { data: Uint8Array; dataUrl: string } | null;
    }
  ) {
    const mimeType = input.firstFrame
      ? IMAGE_DATA_URL.exec(input.firstFrame.dataUrl)?.[1] ?? "image/png"
      : null;
    const response = await ensureOk(
      await this.fetch(
        `${auth.baseUrl}/models/${encodeURIComponent(input.model)}:predictLongRunning`,
        {
          method: "POST",
          headers: { "x-goog-api-key": auth.apiKey, "Content-Type": "application/json" },
          signal,
          body: JSON.stringify({
            instances: [{
              prompt: input.prompt,
              ...(input.firstFrame
                ? {
                    image: {
                      bytesBase64Encoded: Buffer.from(input.firstFrame.data).toString("base64"),
                      mimeType,
                    },
                  }
                : {}),
            }],
            parameters: {
              sampleCount: 1,
              ...(input.aspectRatio ? { aspectRatio: input.aspectRatio } : {}),
              ...(input.resolution ? { resolution: input.resolution } : {}),
              ...(input.duration ? { durationSeconds: input.duration } : {}),
            },
          }),
        }
      )
    );
    const operation = (await response.json()) as { name?: unknown };
    if (
      typeof operation.name !== "string" ||
      !/^[\w./-]{1,300}$/.test(operation.name) ||
      operation.name.includes("..")
    ) {
      throw new StudioError("پاسخ نامعتبر از Google دریافت شد.");
    }
    return operation.name;
  }

  private runVideoJob(id: string, provider: StudioMediaProvider, jobId: string) {
    const auth = this.authFor(provider);
    if (!auth) return false;
    void this.track(id, (signal) => this.pollVideo(id, provider, jobId, auth, signal));
    return true;
  }

  private async pollVideo(
    id: string,
    provider: StudioMediaProvider,
    jobId: string,
    auth: ProviderAuth,
    signal: AbortSignal
  ) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < VIDEO_MAX_POLL_MS) {
      await delay(this.options.videoPollIntervalMs ?? VIDEO_POLL_INTERVAL_MS, signal);
      const result =
        provider === "bfl"
          ? await this.pollBflOnce(jobId, auth.apiKey, signal)
          : provider === "google"
          ? await this.pollGoogleVideo(jobId, auth, signal)
          : await this.pollOpenRouterVideo(jobId, auth.apiKey, signal);
      if (!result) continue;
      const download = await ensureOk(
        await this.fetch(result.url, { headers: result.headers, signal })
      );
      const mimeType = download.headers.get("content-type")?.split(";")[0] || "video/mp4";
      await this.saveMedia(
        id,
        await readLimited(download),
        mimeType.startsWith("video/") ? mimeType : "video/mp4",
        result.cost !== null ? { cost: result.cost } : {}
      );
      return;
    }
    throw new StudioError("ساخت ویدیو بیش از حد طول کشید.");
  }

  /** Returns the download once complete, null while still running. */
  private async pollOpenRouterVideo(jobId: string, apiKey: string, signal: AbortSignal) {
    const headers = this.openRouterHeaders(apiKey);
    const response = await ensureOk(
      await this.fetch(`${OPENROUTER_API}/videos/${encodeURIComponent(jobId)}`, {
        headers,
        signal,
      })
    );
    const poll = (await response.json()) as {
      status?: unknown;
      unsigned_urls?: unknown;
      usage?: { cost?: unknown };
      error?: unknown;
    };
    if (poll.status === "completed") {
      const url = Array.isArray(poll.unsigned_urls) ? poll.unsigned_urls[0] : null;
      if (typeof url !== "string" || !url.startsWith(`${OPENROUTER_API}/`)) {
        throw new StudioError("آدرس دریافت ویدیو نامعتبر است.");
      }
      const cost = Number(poll.usage?.cost);
      return { url, headers, cost: Number.isFinite(cost) ? cost : null };
    }
    if (
      typeof poll.status === "string" &&
      ["failed", "dead", "cancelled", "expired"].includes(poll.status)
    ) {
      throw new StudioError(
        typeof poll.error === "string" && poll.error
          ? poll.error.slice(0, 500)
          : "ساخت ویدیو ناموفق بود."
      );
    }
    return null;
  }

  private async pollGoogleVideo(operation: string, auth: ProviderAuth, signal: AbortSignal) {
    const headers = { "x-goog-api-key": auth.apiKey };
    const response = await ensureOk(
      await this.fetch(`${auth.baseUrl}/${operation}`, { headers, signal })
    );
    const poll = (await response.json()) as {
      done?: unknown;
      error?: { message?: unknown };
      response?: {
        generateVideoResponse?: {
          generatedSamples?: Array<{ video?: { uri?: unknown } }>;
          raiMediaFilteredReasons?: unknown;
        };
      };
    };
    if (poll.done !== true) return null;
    if (poll.error) {
      throw new StudioError(
        typeof poll.error.message === "string"
          ? poll.error.message.slice(0, 500)
          : "ساخت ویدیو ناموفق بود."
      );
    }
    const generated = poll.response?.generateVideoResponse;
    const uri = generated?.generatedSamples?.[0]?.video?.uri;
    if (typeof uri !== "string") {
      const filtered = generated?.raiMediaFilteredReasons;
      throw new StudioError(
        Array.isArray(filtered) && typeof filtered[0] === "string"
          ? `Google این ویدیو را به دلیل سیاست محتوا نساخت: ${filtered[0].slice(0, 300)}`
          : "Google ویدیویی برنگرداند."
      );
    }
    if (new URL(uri).origin !== new URL(auth.baseUrl).origin) {
      throw new StudioError("آدرس دریافت ویدیو نامعتبر است.");
    }
    return { url: uri, headers, cost: null };
  }

  async generateSpeech(request: StudioSpeechRequest): Promise<StudioItem> {
    const provider =
      request.provider === "elevenlabs" || request.provider === "google"
        ? request.provider
        : "openrouter";
    const auth = this.authFor(provider);
    if (!auth) throw new StudioError(missingKeyMessage(provider));
    const apiKey = auth.apiKey;
    const model = modelId(request.modelId);
    const input = trimmed(request.input, STUDIO_LIMITS.speechInput, "متن");
    const voice =
      typeof request.voice === "string" && /^[\w.:-]{1,120}$/.test(request.voice)
        ? request.voice
        : "";
    if (provider === "elevenlabs" && !voice) {
      throw new StudioError("یک صدا انتخاب کنید.");
    }
    const instructions =
      typeof request.instructions === "string"
        ? request.instructions.trim().slice(0, 1_000)
        : "";
    const speed =
      provider !== "google" &&
      typeof request.speed === "number" &&
      request.speed >= 0.5 &&
      request.speed <= 2
        ? request.speed
        : undefined;

    const record = this.insert({
      kind: "speech",
      provider,
      modelId: model,
      prompt: input,
      text: input,
      params: {
        voice: voice || null,
        instructions: instructions || null,
        speed: speed ?? null,
      },
    });

    void this.track(record.id, async (signal) => {
      this.patch(record.id, { status: "running" });
      if (provider === "google") {
        const result = await generateSpeech({
          model: createGoogleGenerativeAI({
            apiKey,
            baseURL: auth.baseUrl,
            fetch: this.fetch,
          }).speech(model),
          text: input,
          voice: voice || undefined,
          instructions: instructions || undefined,
          abortSignal: signal,
          maxRetries: 1,
        });
        await this.saveMedia(
          record.id,
          Buffer.from(result.audio.uint8Array),
          result.audio.mediaType || "audio/wav"
        );
        return;
      }
      const response =
        provider === "elevenlabs"
          ? await this.fetch(
              `${ELEVENLABS_API}/v1/text-to-speech/${encodeURIComponent(voice)}?output_format=mp3_44100_128`,
              {
                method: "POST",
                signal,
                headers: {
                  "xi-api-key": apiKey,
                  "Content-Type": "application/json",
                  Accept: "audio/mpeg",
                },
                body: JSON.stringify({
                  text: input,
                  model_id: model,
                  ...(speed ? { voice_settings: { speed } } : {}),
                }),
              }
            )
          : await this.fetch(`${OPENROUTER_API}/audio/speech`, {
              method: "POST",
              signal,
              headers: this.openRouterHeaders(apiKey),
              body: JSON.stringify({
                model,
                input,
                response_format: "mp3",
                ...(voice ? { voice } : {}),
                ...(instructions ? { instructions } : {}),
                ...(speed ? { speed } : {}),
              }),
            });
      await ensureOk(response);
      await this.saveMedia(record.id, await readLimited(response, 64 * 1024 * 1024), "audio/mpeg");
    });

    return toPublicStudioItem(record);
  }

  // MARK: Transcripts

  async saveTranscript(input: StudioTranscriptInput): Promise<StudioItem> {
    if (!isStudioItemId(input.id)) throw new StudioError("شناسه نامعتبر است.");
    const text = trimmed(input.text, STUDIO_LIMITS.transcript, "متن رونویسی");
    const sourceName =
      typeof input.sourceName === "string" && input.sourceName.trim()
        ? input.sourceName.trim().slice(0, 200)
        : "رونویسی";
    const durationSeconds =
      typeof input.durationSeconds === "number" && Number.isFinite(input.durationSeconds)
        ? input.durationSeconds
        : null;
    const existing = this.store.get(input.id);
    if (existing) {
      return toPublicStudioItem(this.patch(input.id, { text, durationSeconds })!);
    }

    const record = this.insert({
      id: input.id,
      kind: "transcript",
      status: "done",
      provider: "shenava",
      modelId: typeof input.modelKey === "string" ? input.modelKey.slice(0, 40) : "",
      prompt: "",
      title: sourceName,
      text,
      durationSeconds,
      params: { sourceName },
    });

    const audio = input.audio;
    const mimeType =
      typeof input.mimeType === "string" && /^audio\/[\w.+-]{1,40}$/.test(input.mimeType)
        ? input.mimeType
        : null;
    if (
      audio instanceof ArrayBuffer &&
      mimeType &&
      audio.byteLength > 0 &&
      audio.byteLength <= STUDIO_LIMITS.maxTranscriptAudioBytes
    ) {
      await this.saveMedia(record.id, Buffer.from(audio), mimeType, {}, "done");
    }
    return this.get(record.id)!;
  }

  /**
   * Transcribes audio with a Gemini model. The audio is saved first so it can
   * be played while the transcript is still being written.
   */
  async transcribeRemote(request: StudioRemoteTranscriptionRequest): Promise<StudioItem> {
    const auth = this.requireAuth("google");
    const model = modelId(request.modelId);
    const mimeType =
      typeof request.mimeType === "string" && /^audio\/[\w.+-]{1,40}$/.test(request.mimeType)
        ? request.mimeType
        : null;
    if (!mimeType) throw new StudioError("قالب فایل صوتی پشتیبانی نمی‌شود.");
    if (
      !(request.audio instanceof ArrayBuffer) ||
      request.audio.byteLength === 0 ||
      request.audio.byteLength > STUDIO_LIMITS.maxRemoteTranscriptionBytes
    ) {
      throw new StudioError("حجم فایل صوتی نامعتبر است.");
    }
    const sourceName =
      typeof request.sourceName === "string" && request.sourceName.trim()
        ? request.sourceName.trim().slice(0, 200)
        : "رونویسی";
    const instructions =
      typeof request.instructions === "string" ? request.instructions.trim().slice(0, 1_000) : "";
    const audio = Buffer.from(request.audio);

    const record = this.insert({
      kind: "transcript",
      provider: "google",
      modelId: model,
      prompt: "",
      title: sourceName,
      durationSeconds:
        typeof request.durationSeconds === "number" && Number.isFinite(request.durationSeconds)
          ? request.durationSeconds
          : null,
      params: { sourceName, instructions: instructions || null },
    });
    await this.saveMedia(record.id, audio, mimeType, {}, "running");

    void this.track(record.id, async (signal) => {
      let uploaded: { name: string; uri: string } | null = null;
      try {
        if (audio.byteLength > GEMINI_INLINE_AUDIO_BYTES) {
          uploaded = await uploadGeminiFile(this.fetch, auth, audio, mimeType, sourceName, signal);
        }
        const text = await transcribeWithGemini(
          this.fetch,
          auth,
          {
            modelId: model,
            mimeType,
            audio: uploaded ? { fileUri: uploaded.uri } : { inline: audio },
            instructions: instructions || undefined,
          },
          signal
        );
        this.patch(record.id, {
          status: "done",
          text: text.slice(0, STUDIO_LIMITS.transcript),
          error: null,
        });
      } finally {
        if (uploaded) await deleteGeminiFile(this.fetch, auth, uploaded.name);
      }
    });

    return this.get(record.id)!;
  }

  updateTranscript(id: string, patch: StudioTranscriptPatch): StudioItem | null {
    const record = this.store.get(id);
    if (!record || record.kind !== "transcript") return null;
    const correctedText =
      typeof patch.correctedText === "string"
        ? patch.correctedText.slice(0, STUDIO_LIMITS.transcript)
        : null;
    const updated = this.patch(id, { correctedText });
    return updated ? toPublicStudioItem(updated) : null;
  }

  // MARK: Media

  /** Serves `nimruz-media://item/<id>` with HTTP range support for seeking. */
  async handleMediaRequest(request: Request): Promise<Response> {
    let id: string;
    try {
      const url = new URL(request.url);
      id = decodeURIComponent(url.pathname.replace(/^\//, ""));
      if (url.hostname !== "item" || !isStudioItemId(id)) {
        return new Response("Bad request", { status: 400 });
      }
    } catch {
      return new Response("Bad request", { status: 400 });
    }
    const record = this.store.get(id);
    const file = this.mediaPath(id);
    if (!record || !file) return new Response("Not found", { status: 404 });

    let size: number;
    try {
      size = (await stat(file)).size;
    } catch {
      return new Response("Not found", { status: 404 });
    }
    const headers = new Headers({
      "Content-Type": record.mimeType ?? "application/octet-stream",
      "Accept-Ranges": "bytes",
      "Cache-Control": "private, max-age=31536000, immutable",
    });
    const range = parseByteRange(request.headers.get("range"), size);
    if (range === "invalid") {
      headers.set("Content-Range", `bytes */${size}`);
      return new Response(null, { status: 416, headers });
    }
    const start = range?.start ?? 0;
    const end = range?.end ?? size - 1;
    headers.set("Content-Length", String(size === 0 ? 0 : end - start + 1));
    if (range) headers.set("Content-Range", `bytes ${start}-${end}/${size}`);
    const body =
      size === 0
        ? null
        : (Readable.toWeb(createReadStream(file, { start, end })) as ReadableStream);
    return new Response(body, { status: range ? 206 : 200, headers });
  }

  suggestedFileName(id: string) {
    const record = this.store.get(id);
    if (!record) return null;
    const base = (record.kind === "transcript"
      ? String(record.params.sourceName ?? record.title)
      : record.title
    )
      .replace(/\.[\w]{1,5}$/, "")
      .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, " ")
      .trim()
      .slice(0, 60) || `nimruz-${record.kind}`;
    return `${base}.${mediaExtension(record.mimeType)}`;
  }

  // MARK: Internals

  private authFor(provider: StudioProvider): ProviderAuth | null {
    if (provider === "google") return this.options.getGoogleAuth();
    if (provider === "bfl") {
      const apiKey = this.options.getBflKey?.() ?? null;
      return apiKey ? { apiKey, baseUrl: BFL_API } : null;
    }
    const apiKey =
      provider === "elevenlabs"
        ? this.options.getElevenLabsKey()
        : provider === "openrouter"
          ? this.options.getOpenRouterKey()
          : null;
    return apiKey
      ? { apiKey, baseUrl: provider === "elevenlabs" ? ELEVENLABS_API : OPENROUTER_API }
      : null;
  }

  private requireAuth(provider: StudioProvider): ProviderAuth {
    const auth = this.authFor(provider);
    if (!auth) throw new StudioError(missingKeyMessage(provider));
    return auth;
  }

  private openRouterHeaders(apiKey: string) {
    return {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "X-Title": APP_NAME,
      "HTTP-Referer": "https://github.com/xmannii/nimruz-desktop",
    };
  }

  private async resolveImageInput(
    input: StudioImageInput
  ): Promise<{ data: Uint8Array; dataUrl: string }> {
    if (input?.type === "item") {
      const record = this.store.get(input.itemId);
      const file = this.mediaPath(input.itemId);
      if (!record || record.kind !== "image" || !file || !record.mimeType) {
        throw new StudioError("تصویر مرجع پیدا نشد.");
      }
      const data = await readFile(file);
      return {
        data,
        dataUrl: `data:${record.mimeType};base64,${data.toString("base64")}`,
      };
    }
    if (input?.type === "data-url" && typeof input.dataUrl === "string") {
      const match = IMAGE_DATA_URL.exec(input.dataUrl);
      if (match) {
        const data = Buffer.from(match[2], "base64");
        if (data.byteLength > 0 && data.byteLength <= STUDIO_LIMITS.maxReferenceImageBytes) {
          return { data, dataUrl: input.dataUrl };
        }
        throw new StudioError("حجم تصویر مرجع بیش از ۸ مگابایت است.");
      }
    }
    throw new StudioError("تصویر مرجع نامعتبر است.");
  }

  private insert(
    input: Pick<StudioItemRecord, "kind" | "provider" | "modelId" | "prompt" | "params"> &
      Partial<StudioItemRecord>
  ): StudioItemRecord {
    const now = Date.now();
    const record: StudioItemRecord = {
      id: input.id ?? randomUUID(),
      kind: input.kind,
      status: input.status ?? "pending",
      title: input.title ?? studioItemTitle(input.prompt, input.modelId),
      prompt: input.prompt,
      provider: input.provider,
      modelId: input.modelId,
      params: input.params,
      mimeType: null,
      hasMedia: false,
      storagePath: null,
      text: input.text ?? null,
      correctedText: null,
      error: null,
      cost: null,
      durationSeconds: input.durationSeconds ?? null,
      parentId: input.parentId ?? null,
      createdAt: now,
      updatedAt: now,
    };
    this.store.insert(record);
    this.options.onItemChange(toPublicStudioItem(record));
    return record;
  }

  private patch(id: string, patch: StudioItemPatch) {
    const updated = this.store.update(id, patch);
    if (updated) this.options.onItemChange(toPublicStudioItem(updated));
    return updated;
  }

  private async saveMedia(
    id: string,
    data: Buffer,
    mimeType: string,
    extra: StudioItemPatch = {},
    status: StudioItemRecord["status"] = "done"
  ) {
    if (!this.store.get(id)) return;
    await mkdir(this.mediaDirectory, { recursive: true });
    const fileName = `${id}.${mediaExtension(mimeType)}`;
    await writeFile(path.join(this.mediaDirectory, fileName), data);
    if (!this.store.get(id)) {
      // Deleted while the file was being written.
      await rm(path.join(this.mediaDirectory, fileName), { force: true });
      return;
    }
    this.patch(id, {
      ...extra,
      status,
      error: null,
      mimeType,
      storagePath: fileName,
    });
  }

  /** Runs background work for an item, recording failures on the row. */
  private async track(id: string, work: (signal: AbortSignal) => Promise<void>) {
    const controller = new AbortController();
    this.controllers.set(id, controller);
    try {
      await work(controller.signal);
    } catch (error) {
      if (controller.signal.aborted) return;
      this.patch(id, { status: "failed", error: errorMessage(error) });
    } finally {
      if (this.controllers.get(id) === controller) this.controllers.delete(id);
    }
  }
}
