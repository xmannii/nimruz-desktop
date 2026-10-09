import type { StudioTab } from "./format";

const STORAGE_KEY = "nimruz.studio.preferences.v1";

export type StudioPreferences = {
  lastTab?: StudioTab;
  imageModelId?: string;
  imageAspectRatio?: string;
  imageCount?: number;
  videoModelId?: string;
  videoAspectRatio?: string;
  videoResolution?: string;
  videoDuration?: number;
  videoAudio?: boolean;
  speechModelKey?: string;
  speechVoice?: string;
  speechSpeed?: number;
};

export const DEFAULT_STUDIO_PREFERENCES: Required<
  Pick<StudioPreferences, "imageModelId" | "imageAspectRatio" | "imageCount" | "videoModelId" | "speechModelKey">
> = {
  imageModelId: "google/gemini-3.1-flash-image",
  imageAspectRatio: "1:1",
  imageCount: 1,
  videoModelId: "google/veo-3.1-fast",
  speechModelKey: "openrouter::google/gemini-3.8-flash-tts",
};

/** Per-device convenience only; Studio works when storage is unavailable. */
export function loadStudioPreferences(): StudioPreferences {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    return parsed && typeof parsed === "object" ? (parsed as StudioPreferences) : {};
  } catch {
    return {};
  }
}

export function saveStudioPreferences(patch: StudioPreferences) {
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ ...loadStudioPreferences(), ...patch })
    );
  } catch {
    // Storage can be unavailable; preferences are a convenience.
  }
}
