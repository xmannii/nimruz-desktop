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

export const STUDIO_PROVIDERS = ["openrouter", "elevenlabs", "shenava"] as const;
export type StudioProvider = (typeof STUDIO_PROVIDERS)[number];

/** Credential id used for the user's own ElevenLabs key. */
export const ELEVENLABS_CREDENTIAL_ID = "elevenlabs";

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
  name: string;
  description: string;
  acceptsImageInput: boolean;
};

export type StudioVideoModel = {
  id: string;
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
  name: string;
  provider: Extract<StudioProvider, "openrouter" | "elevenlabs">;
  voices: StudioVoice[];
  supportsInstructions: boolean;
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

export type StudioImageRequest = {
  modelId: string;
  prompt: string;
  aspectRatio?: string;
  count?: number;
  references?: StudioImageInput[];
  parentId?: string;
};

export type StudioVideoRequest = {
  modelId: string;
  prompt: string;
  aspectRatio?: string;
  resolution?: string;
  duration?: number;
  generateAudio?: boolean;
  firstFrame?: StudioImageInput;
  parentId?: string;
};

export type StudioSpeechRequest = {
  provider: Extract<StudioProvider, "openrouter" | "elevenlabs">;
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

export type StudioElevenLabsStatus = {
  configured: boolean;
  hint: string | null;
};
