export const DEFAULT_SILENCE_ENDPOINT = {
  speechRms: 0.015,
  noiseMultiplier: 3.5,
  minSpeechMs: 220,
  silenceMs: 1_250,
  preSpeechTimeoutMs: 8_000,
  startupIgnoreMs: 280,
} as const;

export type SilenceEndpointConfig = {
  speechRms: number;
  noiseMultiplier: number;
  minSpeechMs: number;
  silenceMs: number;
  preSpeechTimeoutMs: number;
  startupIgnoreMs: number;
};

export type SilenceEndpointState = {
  heardSpeech: boolean;
  speechMs: number;
  silenceMs: number;
  elapsedMs: number;
  noiseRms: number;
};

export type SilenceEndpointDecision = "continue" | "end" | "timeout";

export function createSilenceEndpointState(): SilenceEndpointState {
  return {
    heardSpeech: false,
    speechMs: 0,
    silenceMs: 0,
    elapsedMs: 0,
    noiseRms: 0.004,
  };
}

export function pcmRms(samples: ArrayLike<number>): number {
  if (samples.length === 0) return 0;
  let sum = 0;
  for (let index = 0; index < samples.length; index += 1) {
    const value = samples[index] ?? 0;
    sum += value * value;
  }
  return Math.sqrt(sum / samples.length);
}

export function advanceSilenceEndpoint(
  state: SilenceEndpointState,
  rms: number,
  durationMs: number,
  config: SilenceEndpointConfig = DEFAULT_SILENCE_ENDPOINT
): SilenceEndpointDecision {
  if (durationMs <= 0) return "continue";

  state.elapsedMs += durationMs;

  if (state.elapsedMs <= config.startupIgnoreMs) {
    if (rms > 0) state.noiseRms = Math.max(state.noiseRms, rms);
    return "continue";
  }

  const threshold = Math.max(
    config.speechRms,
    state.noiseRms * config.noiseMultiplier
  );
  const isSpeech = rms >= threshold;

  if (!isSpeech) {
    state.noiseRms = state.noiseRms * 0.97 + Math.max(0, rms) * 0.03;
    state.silenceMs += durationMs;
    if (state.heardSpeech && state.silenceMs >= config.silenceMs) return "end";
    if (!state.heardSpeech && state.elapsedMs >= config.preSpeechTimeoutMs) {
      return "timeout";
    }
    return "continue";
  }

  state.speechMs += durationMs;
  state.silenceMs = 0;
  if (state.speechMs >= config.minSpeechMs) state.heardSpeech = true;
  return "continue";
}
