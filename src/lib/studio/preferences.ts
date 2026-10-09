import type { StudioTab } from "./format";

const STORAGE_KEY = "nimruz.studio.preferences.v1";

export type StudioPreferences = {
  lastTab?: StudioTab;
  imageModelKey?: string;
  imageAspectRatio?: string;
  imageCount?: number;
  videoModelKey?: string;
  videoCamera?: string;
  imageStyle?: string;
  videoAspectRatio?: string;
  videoResolution?: string;
  videoDuration?: number;
  videoAudio?: boolean;
  speechModelKey?: string;
  speechVoice?: string;
  speechSpeed?: number;
};

/** Defaults favour the newest broadly capable models with good Persian support. */
export const DEFAULT_STUDIO_PREFERENCES: Required<
  Pick<StudioPreferences, "imageModelKey" | "imageAspectRatio" | "imageCount" | "videoModelKey" | "speechModelKey">
> = {
  imageModelKey: "openrouter::google/gemini-nano-banana-2.1",
  imageAspectRatio: "1:1",
  imageCount: 2,
  videoModelKey: "openrouter::bytedance/seedance-2.5",
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
