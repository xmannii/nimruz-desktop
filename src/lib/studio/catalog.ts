import type {
  StudioTranscriptionModel,
  StudioImageModel,
  StudioSpeechModel,
  StudioVideoModel,
  StudioVoice,
} from "./types";

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function listData(payload: unknown): JsonRecord[] {
  if (!isRecord(payload) || !Array.isArray(payload.data)) return [];
  return payload.data.filter(isRecord);
}

function text(value: unknown, max = 600) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string" && entry.length > 0)
    : [];
}

function validModelId(value: unknown): value is string {
  return typeof value === "string" && /^[\w.:/-]{1,200}$/.test(value);
}

function createdAt(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value * 1000
    : null;
}

function bySortName<T extends { name: string }>(models: T[]) {
  return models.sort((a, b) => a.name.localeCompare(b.name, "en"));
}

/** Parses `GET /models?output_modalities=image` from OpenRouter. */
export function parseOpenRouterImageModels(payload: unknown): StudioImageModel[] {
  const models = listData(payload).flatMap((item): StudioImageModel[] => {
    if (!validModelId(item.id)) return [];
    const architecture = isRecord(item.architecture) ? item.architecture : {};
    const output = strings(architecture.output_modalities);
    if (!output.includes("image")) return [];
    if (item.id.startsWith("openrouter/")) return [];
    return [{
      id: item.id,
      provider: "openrouter",
      createdAt: createdAt(item.created),
      name: text(item.name, 120) || item.id,
      description: text(item.description),
      acceptsImageInput: strings(architecture.input_modalities).includes("image"),
    }];
  });
  return bySortName(models);
}

/**
 * Picks the cheapest per-second price from OpenRouter's loosely structured
 * pricing SKUs. Keys mentioning "cents" are converted to dollars; token based
 * SKUs are ignored because they cannot be expressed per second.
 */
export function minVideoPricePerSecond(skus: unknown): number | null {
  if (!isRecord(skus)) return null;
  let min: number | null = null;
  for (const [key, raw] of Object.entries(skus)) {
    if (!/second/.test(key) || /minimum|reference|image_input|continuation|megapixel/.test(key)) {
      continue;
    }
    const value = Number(raw);
    if (!Number.isFinite(value) || value <= 0) continue;
    const dollars = key.startsWith("cents") ? value / 100 : value;
    if (min === null || dollars < min) min = dollars;
  }
  return min;
}

/**
 * Parses `GET /videos/models`. Models without selectable durations are
 * video-to-video tools (editing, upscaling, avatars) and are skipped because
 * Studio only offers text and image to video.
 */
export function parseOpenRouterVideoModels(payload: unknown): StudioVideoModel[] {
  const models = listData(payload).flatMap((item): StudioVideoModel[] => {
    if (!validModelId(item.id)) return [];
    const durations = Array.isArray(item.supported_durations)
      ? item.supported_durations
          .filter((value): value is number => Number.isInteger(value) && value > 0)
          .sort((a, b) => a - b)
      : [];
    if (durations.length === 0) return [];
    return [{
      id: item.id,
      provider: "openrouter",
      createdAt: createdAt(item.created),
      name: text(item.name, 120) || item.id,
      description: text(item.description),
      durations: Array.from(new Set(durations)),
      resolutions: strings(item.supported_resolutions),
      aspectRatios: strings(item.supported_aspect_ratios),
      supportsFirstFrame: strings(item.supported_frame_images).includes("first_frame"),
      supportsAudio: item.generate_audio === true,
      minPricePerSecond: minVideoPricePerSecond(item.pricing_skus),
    }];
  });
  return bySortName(models);
}

function voicesFromIds(ids: string[]): StudioVoice[] {
  return ids.map((id) => ({
    id,
    name: id.includes(":") ? id.split(":")[0] : id,
  }));
}

/** Parses `GET /models?output_modalities=speech` from OpenRouter. */
export function parseOpenRouterSpeechModels(payload: unknown): StudioSpeechModel[] {
  const models = listData(payload).flatMap((item): StudioSpeechModel[] => {
    if (!validModelId(item.id)) return [];
    const architecture = isRecord(item.architecture) ? item.architecture : {};
    if (!strings(architecture.output_modalities).includes("speech")) return [];
    const id = item.id;
    return [{
      id,
      name: text(item.name, 120) || id,
      provider: "openrouter",
      createdAt: createdAt(item.created),
      voices: voicesFromIds(strings(item.supported_voices)),
      supportsInstructions:
        id.startsWith("google/") || id.startsWith("openai/"),
      supportsSpeed: !id.startsWith("google/"),
    }];
  });
  return bySortName(models);
}

/** Parses ElevenLabs `GET /v1/models` into text-to-speech capable models. */
export function parseElevenLabsModels(
  payload: unknown,
  voices: StudioVoice[]
): StudioSpeechModel[] {
  if (!Array.isArray(payload)) return [];
  return payload.flatMap((item): StudioSpeechModel[] => {
    if (!isRecord(item) || !validModelId(item.model_id)) return [];
    if (item.can_do_text_to_speech !== true) return [];
    return [{
      id: item.model_id,
      name: text(item.name, 120) || item.model_id,
      provider: "elevenlabs",
      voices,
      supportsInstructions: false,
      supportsSpeed: true,
    }];
  });
}

/** George, ElevenLabs' own default voice; available on every plan. */
export const ELEVENLABS_DEFAULT_VOICE_ID = "JBFqnCBsd6RMkjVDRZzb";

function elevenLabsVoiceRank(voice: Record<string, unknown>) {
  if (voice.voice_id === ELEVENLABS_DEFAULT_VOICE_ID) return 0;
  // Voice Library voices saved to the account are not usable through the
  // API on the free plan; ElevenLabs' built-in voices are.
  return voice.category === "premade" ? 1 : 2;
}

/**
 * Parses ElevenLabs `GET /v2/voices`. Built-in voices come first so the
 * automatically chosen voice works on free API keys.
 */
export function parseElevenLabsVoices(payload: unknown): StudioVoice[] {
  if (!isRecord(payload) || !Array.isArray(payload.voices)) return [];
  const voices = payload.voices
    .filter(isRecord)
    .map((voice, index) => ({ voice, index }))
    .sort((a, b) => elevenLabsVoiceRank(a.voice) - elevenLabsVoiceRank(b.voice) || a.index - b.index)
    .map(({ voice }) => voice);
  return voices.flatMap((voice): StudioVoice[] => {
    if (!isRecord(voice) || typeof voice.voice_id !== "string") return [];
    if (!/^[\w-]{1,64}$/.test(voice.voice_id)) return [];
    const labels = isRecord(voice.labels) ? voice.labels : {};
    const description = [labels.gender, labels.accent, labels.age]
      .filter((value): value is string => typeof value === "string" && value.length > 0)
      .join(" · ");
    return [{
      id: voice.voice_id,
      name: text(voice.name, 80) || voice.voice_id,
      description: description || undefined,
      previewUrl:
        typeof voice.preview_url === "string" &&
        voice.preview_url.startsWith("https://")
          ? voice.preview_url
          : undefined,
    }];
  });
}

/** Gemini TTS prebuilt voices with their published character, in Persian. */
export const GEMINI_TTS_VOICES: StudioVoice[] = [
  ["Zephyr", "روشن"],
  ["Puck", "شاد و پرانرژی"],
  ["Charon", "آگاه و روشنگر"],
  ["Kore", "محکم"],
  ["Fenrir", "هیجان‌زده"],
  ["Leda", "جوان"],
  ["Orus", "محکم"],
  ["Aoede", "سبک و روان"],
  ["Callirrhoe", "راحت و آسوده"],
  ["Autonoe", "روشن"],
  ["Enceladus", "نفس‌دار"],
  ["Iapetus", "شفاف"],
  ["Umbriel", "راحت و آسوده"],
  ["Algieba", "نرم"],
  ["Despina", "نرم"],
  ["Erinome", "شفاف"],
  ["Algenib", "زبر و خش‌دار"],
  ["Rasalgethi", "آگاه و روشنگر"],
  ["Laomedeia", "شاد و پرانرژی"],
  ["Achernar", "ملایم"],
  ["Alnilam", "محکم"],
  ["Schedar", "یکنواخت"],
  ["Gacrux", "پخته"],
  ["Pulcherrima", "رو به جلو"],
  ["Achird", "دوستانه"],
  ["Zubenelgenubi", "خودمانی"],
  ["Vindemiatrix", "مهربان"],
  ["Sadachbia", "سرزنده"],
  ["Sadaltager", "دانا"],
  ["Sulafat", "گرم"],
].map(([id, description]) => ({ id, name: id, description }));

/** Veo limits from the Gemini API docs; the models endpoint does not list them. */
function veoCapabilities(id: string) {
  if (id.startsWith("veo-2")) {
    return { durations: [5, 6, 7, 8], resolutions: ["720p"], aspectRatios: ["16:9", "9:16"] };
  }
  return { durations: [4, 6, 8], resolutions: ["720p", "1080p"], aspectRatios: ["16:9", "9:16"] };
}

/**
 * Splits Gemini API `GET /models` into Studio image (Imagen and Gemini
 * image models), video (Veo), and speech (Gemini TTS) models.
 */
export function parseGoogleModels(payload: unknown): {
  image: StudioImageModel[];
  video: StudioVideoModel[];
  speech: StudioSpeechModel[];
  transcription: StudioTranscriptionModel[];
} {
  const transcription: StudioTranscriptionModel[] = [];
  const image: StudioImageModel[] = [];
  const video: StudioVideoModel[] = [];
  const speech: StudioSpeechModel[] = [];
  const models = isRecord(payload) && Array.isArray(payload.models) ? payload.models : [];
  for (const item of models) {
    if (!isRecord(item) || typeof item.name !== "string") continue;
    const id = item.name.replace(/^models\//, "");
    if (!validModelId(id)) continue;
    const methods = strings(item.supportedGenerationMethods);
    const name = text(item.displayName, 120) || id;
    const description = text(item.description);
    if (id.startsWith("imagen-") && methods.includes("predict")) {
      image.push({ id, provider: "google", name, description, acceptsImageInput: false });
    } else if (
      id.includes("-image") &&
      !id.includes("embedding") &&
      methods.includes("generateContent")
    ) {
      image.push({ id, provider: "google", name, description, acceptsImageInput: true });
    } else if (id.startsWith("veo-") && methods.includes("predictLongRunning")) {
      video.push({
        id,
        provider: "google",
        name,
        description,
        ...veoCapabilities(id),
        supportsFirstFrame: true,
        supportsAudio: false,
        minPricePerSecond: null,
      });
    } else if (isGeminiAudioUnderstandingModel(id) && methods.includes("generateContent")) {
      transcription.push({ id, provider: "google", name, description });
    } else if (id.includes("-tts") && methods.includes("generateContent")) {
      speech.push({
        id,
        provider: "google",
        name,
        voices: GEMINI_TTS_VOICES,
        supportsInstructions: true,
        supportsSpeed: false,
      });
    }
  }
  return {
    image: bySortName(image),
    video: bySortName(video),
    speech: bySortName(speech),
    transcription: bySortName(transcription),
  };
}

/** Text-output Gemini models accept audio input; skip specialised variants. */
function isGeminiAudioUnderstandingModel(id: string) {
  return (
    id.startsWith("gemini-") &&
    !/(image|tts|embedding|live|native-audio|computer-use|robotics|aqa|thinking-exp)/.test(id)
  );
}
