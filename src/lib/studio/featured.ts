import type { StudioKind } from "./types";

/**
 * Hand-picked flagship models shown first in each picker, best first.
 * Patterns match both OpenRouter slugs and direct Google model ids, so a
 * newer point release (e.g. 2.5 → 2.6) keeps its place automatically.
 */
const FEATURED: Record<Extract<StudioKind, "image" | "video" | "speech">, RegExp[]> = {
  image: [
    /gemini-nano-banana-2\.\d|nano-banana/,
    /gpt-image-2\.5/,
    /gemini-3(?:\.\d)?-pro-image/,
    /gemini-3\.\d-flash-image/,
    /seedream-5/,
    /flux-3-image/,
    /flux-2-max/,
    /flux-kontext-max/,
    /grok-imagine-image-2/,
    /qwen-image-3-pro/,
    /imagen-4\.\d-ultra|imagen-4/,
    /recraft-v4\.1/,
  ],
  video: [
    /seedance-2\.5/,
    /veo-3\.\d(?:-generate)?(?:-preview)?$|veo-3\.\d$/,
    /veo-3\.\d-fast/,
    /kling-v3\.\d-pro/,
    /wan-3\.\d-prime/,
    /grok-imagine-video-1\.5$/,
    /hailuo-3-max/,
    /flux-3-video/,
    /happyhorse-1\.1/,
  ],
  speech: [
    /eleven-v4$|eleven_v4/,
    /gemini-3\.8-flash-tts/,
    /eleven-v3$|eleven_v3/,
    /gemini-3\.8-flash-lite-tts/,
    /mai-voice-2\.1$/,
    /eleven-v4-turbo|eleven-flash-v2\.5|eleven_flash_v2_5/,
    /gpt-4o-mini-tts/,
    /minimax\/speech-2\.8-hd/,
  ],
};

/** Lower is better; null when the model is not featured. */
export function featuredRank(kind: keyof typeof FEATURED, modelId: string) {
  const index = FEATURED[kind].findIndex((pattern) => pattern.test(modelId));
  return index === -1 ? null : index;
}

const NEW_WINDOW_MS = 60 * 86_400_000;

export function isNewModel(createdAt: number | null | undefined, now = Date.now()) {
  return typeof createdAt === "number" && now - createdAt < NEW_WINDOW_MS;
}

/** ElevenLabs v3/v4 understand inline audio tags such as [whispers]. */
export function supportsAudioTags(modelId: string) {
  return /eleven[-_]v[34](?:[-_]|$)/.test(modelId);
}
