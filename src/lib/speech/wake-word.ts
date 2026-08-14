export const WAKE_WORD_SAMPLE_RATE = 16_000;
export const WAKE_WORD_WINDOW_SAMPLES = WAKE_WORD_SAMPLE_RATE * 2;
export const WAKE_WORD_HOP_SAMPLES = Math.round(WAKE_WORD_SAMPLE_RATE * 0.16);
export const WAKE_WORD_DEFAULT_THRESHOLD = 0.73;
export const WAKE_WORD_MIN_THRESHOLD = 0.5;
export const WAKE_WORD_MAX_THRESHOLD = 0.95;

export type WakeWordSettings = {
  enabled: boolean;
  threshold: number;
};

export type WakeWordPhase =
  | "disabled"
  | "loading"
  | "listening"
  | "paused"
  | "error";

export type WakeWordStatus = {
  settings: WakeWordSettings;
  phase: WakeWordPhase;
  captureRequested: boolean;
  latestScore: number;
  lastDetectionAt: number | null;
  error: string | null;
};

export type WakeWordActivation = {
  confidence: number;
  detectedAt: number;
};

export const DEFAULT_WAKE_WORD_SETTINGS: WakeWordSettings = {
  enabled: false,
  threshold: WAKE_WORD_DEFAULT_THRESHOLD,
};

export const INITIAL_WAKE_WORD_STATUS: WakeWordStatus = {
  settings: DEFAULT_WAKE_WORD_SETTINGS,
  phase: "disabled",
  captureRequested: false,
  latestScore: 0,
  lastDetectionAt: null,
  error: null,
};

export function sanitizeWakeWordSettings(value: unknown): WakeWordSettings {
  const settings =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  const threshold =
    typeof settings.threshold === "number" &&
    Number.isFinite(settings.threshold)
      ? Math.min(
          WAKE_WORD_MAX_THRESHOLD,
          Math.max(WAKE_WORD_MIN_THRESHOLD, settings.threshold)
        )
      : WAKE_WORD_DEFAULT_THRESHOLD;

  return {
    enabled:
      typeof settings.enabled === "boolean"
        ? settings.enabled
        : DEFAULT_WAKE_WORD_SETTINGS.enabled,
    threshold,
  };
}

export function isWakeWordAudioPayload(value: unknown): value is ArrayBuffer {
  return (
    value instanceof ArrayBuffer &&
    value.byteLength > 0 &&
    value.byteLength <=
      WAKE_WORD_SAMPLE_RATE * Float32Array.BYTES_PER_ELEMENT &&
    value.byteLength % Float32Array.BYTES_PER_ELEMENT === 0
  );
}
