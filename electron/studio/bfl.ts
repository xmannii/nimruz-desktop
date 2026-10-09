import type { StudioImageModel, StudioVideoModel } from "@/lib/studio/types";

export const BFL_API = "https://api.bfl.ai";

type BflImageFamily = "flux3" | "flux2" | "kontext" | "ultra" | "sized";

type BflImageModel = StudioImageModel & { family: BflImageFamily; maxReferences: number };

/** BFL has no model-list endpoint, so the catalog mirrors its OpenAPI spec. */
const BFL_IMAGE_SPECS: Array<{ id: string; name: string; family: BflImageFamily; maxReferences: number }> = [
  { id: "flux-3-image", name: "FLUX 3", family: "flux3", maxReferences: 10 },
  { id: "flux-2-max", name: "FLUX.2 [max]", family: "flux2", maxReferences: 8 },
  { id: "flux-2-pro", name: "FLUX.2 [pro]", family: "flux2", maxReferences: 8 },
  { id: "flux-2-flex", name: "FLUX.2 [flex]", family: "flux2", maxReferences: 8 },
  { id: "flux-2-klein-9b", name: "FLUX.2 [klein] 9B", family: "flux2", maxReferences: 4 },
  { id: "flux-2-klein-4b", name: "FLUX.2 [klein] 4B", family: "flux2", maxReferences: 4 },
  { id: "flux-kontext-max", name: "FLUX.1 Kontext [max]", family: "kontext", maxReferences: 4 },
  { id: "flux-kontext-pro", name: "FLUX.1 Kontext [pro]", family: "kontext", maxReferences: 4 },
  { id: "flux-pro-1.1-ultra", name: "FLUX1.1 [pro] Ultra", family: "ultra", maxReferences: 1 },
  { id: "flux-pro-1.1", name: "FLUX1.1 [pro]", family: "sized", maxReferences: 0 },
  { id: "flux-dev", name: "FLUX.1 [dev]", family: "sized", maxReferences: 0 },
];

export const BFL_IMAGE_MODELS: BflImageModel[] = BFL_IMAGE_SPECS.map((model) => ({
  ...model,
  provider: "bfl",
  description: "",
  acceptsImageInput: model.maxReferences > 0,
}));

export const BFL_VIDEO_MODELS: StudioVideoModel[] = [
  {
    id: "flux-3-video",
    provider: "bfl",
    name: "FLUX 3 Video",
    description: "",
    durations: Array.from({ length: 16 }, (_, index) => index + 5),
    resolutions: ["hd", "fhd", "qhd", "uhd"],
    aspectRatios: ["16:9", "9:16", "1:1", "4:3", "3:4", "21:9", "9:21", "2:1"],
    supportsFirstFrame: true,
    supportsAudio: true,
    minPricePerSecond: null,
  },
];

/** BFL credits are worth one US cent each. */
export function bflCreditsToUsd(credits: unknown) {
  const value = Number(credits);
  return Number.isFinite(value) && value > 0 ? value / 100 : null;
}

/** ~1 MP output in multiples of 16, as FLUX.2 and FLUX1.1 take width/height. */
export function bflSizeForAspect(aspectRatio: string | undefined) {
  const [w, h] = (aspectRatio ?? "1:1").split(":").map(Number);
  const ratio = w > 0 && h > 0 ? w / h : 1;
  const area = 1024 * 1024;
  const round = (value: number) => Math.max(256, Math.round(value / 16) * 16);
  return { width: round(Math.sqrt(area * ratio)), height: round(Math.sqrt(area / ratio)) };
}

function base64Of(dataUrl: string) {
  const comma = dataUrl.indexOf(",");
  return comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
}

/** Builds the per-family request body for an image model. */
export function buildBflImageBody(input: {
  modelId: string;
  prompt: string;
  aspectRatio?: string;
  references: string[];
}): Record<string, unknown> {
  const model = BFL_IMAGE_MODELS.find((candidate) => candidate.id === input.modelId);
  const family = model?.family ?? "flux2";
  const references = input.references
    .slice(0, model?.maxReferences ?? 0)
    .map(base64Of);
  const body: Record<string, unknown> = { prompt: input.prompt };
  if (family === "flux3") {
    body.aspect_ratio = input.aspectRatio ?? "auto";
    if (references.length > 0) body.images = references;
  } else if (family === "flux2" || family === "sized") {
    Object.assign(body, bflSizeForAspect(input.aspectRatio));
    references.forEach((image, index) => {
      body[index === 0 ? "input_image" : `input_image_${index + 1}`] = image;
    });
    if (family === "flux2") body.output_format = "png";
  } else if (family === "kontext") {
    if (input.aspectRatio) body.aspect_ratio = input.aspectRatio;
    references.forEach((image, index) => {
      body[index === 0 ? "input_image" : `input_image_${index + 1}`] = image;
    });
    body.output_format = "png";
  } else if (family === "ultra") {
    if (input.aspectRatio) body.aspect_ratio = input.aspectRatio;
    if (references[0]) body.image_prompt = references[0];
    body.output_format = "png";
  }
  return body;
}

export function buildBflVideoBody(input: {
  prompt: string;
  aspectRatio?: string;
  resolution?: string;
  duration?: number;
  generateAudio?: boolean;
  firstFrame?: string | null;
}): Record<string, unknown> {
  return {
    mode: input.firstFrame ? "i2v" : "t2v",
    prompt: input.prompt,
    aspect_ratio: input.aspectRatio ?? "auto",
    duration: input.duration && input.duration >= 5 && input.duration <= 20 ? input.duration : "auto",
    resolution: input.resolution ?? "hd",
    ...(typeof input.generateAudio === "boolean" ? { generate_audio: input.generateAudio } : {}),
    ...(input.firstFrame ? { keyframes: base64Of(input.firstFrame) } : {}),
  };
}

/** Only ever send the API key to BFL's own hosts. */
export function isBflApiUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && (url.hostname === "bfl.ai" || url.hostname.endsWith(".bfl.ai"));
  } catch {
    return false;
  }
}

export type BflPollResult =
  | { state: "pending" }
  | { state: "ready"; url: string; cost: number | null }
  | { state: "failed"; message: string };

/** Interprets a polling response; outputs live on signed delivery URLs. */
export function parseBflPoll(payload: unknown): BflPollResult {
  const poll = (payload && typeof payload === "object" ? payload : {}) as {
    status?: unknown;
    result?: Record<string, unknown> | null;
    cost?: unknown;
    details?: unknown;
  };
  const status = typeof poll.status === "string" ? poll.status : "";
  if (status === "Ready") {
    const result = poll.result ?? {};
    const candidate = [result.sample, result.video, result.url].find(
      (value): value is string => typeof value === "string"
    );
    if (!candidate || !isBflApiUrl(candidate)) {
      return { state: "failed", message: "آدرس خروجی Black Forest Labs نامعتبر است." };
    }
    return { state: "ready", url: candidate, cost: bflCreditsToUsd(poll.cost) };
  }
  if (status === "Request Moderated" || status === "Content Moderated") {
    return {
      state: "failed",
      message: "Black Forest Labs این درخواست را به دلیل سیاست محتوا نساخت.",
    };
  }
  if (status === "Error" || status === "Failed" || status === "Task not found" || status === "No Card Generated") {
    return { state: "failed", message: `ساخت ناموفق بود (${status}).` };
  }
  return { state: "pending" };
}
