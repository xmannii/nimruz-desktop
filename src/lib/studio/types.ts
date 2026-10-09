export const STUDIO_KINDS = ["image", "video", "speech", "transcript"] as const;
export type StudioKind = (typeof STUDIO_KINDS)[number];

export const STUDIO_ITEM_STATUSES = [
  "pending",
  "running",
  "done",
  "failed",
  "interrupted",
] as const;
export type StudioItemStatus = (typeof STUDIO_ITEM_STATUSES)[number];

export const STUDIO_PROVIDERS = ["openrouter", "google", "bfl", "elevenlabs", "shenava"] as const;
export type StudioProvider = (typeof STUDIO_PROVIDERS)[number];

/** Providers that generate images and videos. */
export type StudioMediaProvider = Extract<StudioProvider, "openrouter" | "google" | "bfl">;
/** Providers that synthesize speech. */
export type StudioSpeechProvider = Extract<StudioProvider, "openrouter" | "google" | "elevenlabs">;

/** Optional direct connections managed from Studio. */
export const STUDIO_CONNECTIONS = ["google", "bfl", "elevenlabs"] as const;
export type StudioConnectionId = (typeof STUDIO_CONNECTIONS)[number];

/** Credential ids for keys entered in Studio. */
export const STUDIO_CREDENTIAL_IDS: Record<StudioConnectionId, string> = {
  google: "google-ai-studio",
  bfl: "black-forest-labs",
  elevenlabs: "elevenlabs",
};

/** Renderer-safe URL scheme that streams Studio media from disk. */
export const STUDIO_MEDIA_SCHEME = "nimruz-media";

export const STUDIO_ITEM_CHANNEL = "studio:item-changed";
export const STUDIO_ITEM_DELETED_CHANNEL = "studio:item-deleted";

export const STUDIO_LIMITS = {
  prompt: 4_000,
  speechInput: 5_000,
  transcript: 400_000,
  maxImagesPerRequest: 4,
  maxReferenceImages: 4,
  maxReferenceImageBytes: 8 * 1024 * 1024,
  maxTranscriptAudioBytes: 150 * 1024 * 1024,
  listPageSize: 60,
} as const;

export type StudioItem = {
  id: string;
  kind: StudioKind;
  status: StudioItemStatus;
  /** Short label shown in history lists. */
  title: string;
  prompt: string;
  provider: StudioProvider;
  modelId: string;
  params: Record<string, unknown>;
  mimeType: string | null;
  /** True once a media file exists on disk for this item. */
  hasMedia: boolean;
  /** Transcript text, or the spoken input for speech items. */
  text: string | null;
  correctedText: string | null;
  error: string | null;
  /** Provider-reported cost in USD, when available. */
  cost: number | null;
  durationSeconds: number | null;
  parentId: string | null;
  createdAt: number;
  updatedAt: number;
};

export type StudioListOptions = {
  kind?: StudioKind;
  query?: string;
  /** Returns items created strictly before this timestamp. */
  before?: number;
  limit?: number;
};

export type StudioImageModel = {
  id: string;
  /** Release time in ms when the catalog reports it. */
  createdAt?: number | null;
  provider: StudioMediaProvider;
  name: string;
  description: string;
  acceptsImageInput: boolean;
};

export type StudioVideoModel = {
  id: string;
  /** Release time in ms when the catalog reports it. */
  createdAt?: number | null;
  provider: StudioMediaProvider;
  name: string;
  description: string;
  durations: number[];
  resolutions: string[];
  aspectRatios: string[];
  supportsFirstFrame: boolean;
  supportsAudio: boolean;
  /** Cheapest listed USD price per output second, when derivable. */
  minPricePerSecond: number | null;
};

export type StudioSpeechModel = {
  id: string;
  /** Release time in ms when the catalog reports it. */
  createdAt?: number | null;
  name: string;
  provider: StudioSpeechProvider;
  voices: StudioVoice[];
  supportsInstructions: boolean;
  supportsSpeed: boolean;
};

export type StudioVoice = {
  id: string;
  name: string;
  description?: string;
  previewUrl?: string;
};

export type StudioModelCatalog = {
  image: StudioImageModel[];
  video: StudioVideoModel[];
  speech: StudioSpeechModel[];
  fetchedAt: number;
};

/** A reference image supplied by the renderer or an existing Studio item. */
export type StudioImageInput =
  | { type: "data-url"; dataUrl: string }
  | { type: "item"; itemId: string };

/** A creative preset applied on top of the visible prompt. */
export type StudioStyleInput = { id: string; prompt: string };

export type StudioImageRequest = {
  provider?: StudioMediaProvider;
  modelId: string;
  prompt: string;
  style?: StudioStyleInput;
  aspectRatio?: string;
  count?: number;
  references?: StudioImageInput[];
  parentId?: string;
};

export type StudioVideoRequest = {
  provider?: StudioMediaProvider;
  modelId: string;
  prompt: string;
  style?: StudioStyleInput;
  aspectRatio?: string;
  resolution?: string;
  duration?: number;
  generateAudio?: boolean;
  firstFrame?: StudioImageInput;
  parentId?: string;
};

export type StudioSpeechRequest = {
  provider: StudioSpeechProvider;
  modelId: string;
  voice: string;
  input: string;
  instructions?: string;
  speed?: number;
};

export type StudioTranscriptInput = {
  id: string;
  sourceName: string;
  modelKey: string;
  text: string;
  durationSeconds: number | null;
  mimeType: string | null;
  audio?: ArrayBuffer | null;
};

export type StudioTranscriptPatch = {
  correctedText?: string | null;
};

export type StudioConnectionStatus = {
  configured: boolean;
  hint: string | null;
  /** "studio" for a key entered here, "provider" when reused from chat settings. */
  source: "studio" | "provider" | null;
};

export type StudioConnections = Record<StudioConnectionId, StudioConnectionStatus>;

export type StudioEnhanceRequest = {
  /** "speech-tags" adds ElevenLabs v3/v4 audio tags to a script. */
  kind: "image" | "video" | "speech-tags";
  prompt: string;
  providerId?: string;
  model?: string;
};

export function toMediaProvider(value: unknown): StudioMediaProvider {
  return value === "google" || value === "bfl" ? value : "openrouter";
}
