import { SHENAVA_SAMPLE_RATE } from "@/lib/speech/shenava";

export const AUDIO_FILE_ACCEPT = "audio/*,.m4a,.mp4";
export const MAX_AUDIO_FILE_BYTES = 250 * 1024 * 1024;
export const MAX_AUDIO_DURATION_SECONDS = 2 * 60 * 60;
export const TRANSCRIPTION_CHUNK_SECONDS = 150;

const AUDIO_EXTENSIONS = new Set([
  "aac",
  "flac",
  "m4a",
  "mp3",
  "mp4",
  "oga",
  "ogg",
  "opus",
  "wav",
  "webm",
]);

export type AudioFileLike = {
  name: string;
  size: number;
  type: string;
};

export function isSupportedAudioFile(file: AudioFileLike) {
  if (file.size <= 0 || file.size > MAX_AUDIO_FILE_BYTES) return false;
  if (file.type.startsWith("audio/")) return true;
  const extension = file.name.split(".").pop()?.toLowerCase();
  return Boolean(extension && AUDIO_EXTENSIONS.has(extension));
}

export function splitPcmAtSilence(
  samples: Float32Array,
  sampleRate = SHENAVA_SAMPLE_RATE,
  maxChunkSeconds = TRANSCRIPTION_CHUNK_SECONDS
): Float32Array[] {
  const maxSamples = Math.max(1, Math.floor(sampleRate * maxChunkSeconds));
  if (samples.length <= maxSamples) return [samples];

  const chunks: Float32Array[] = [];
  const searchSamples = Math.floor(sampleRate * 5);
  const minimumChunkSamples = Math.floor(sampleRate * 30);
  const analysisWindow = Math.max(1, Math.floor(sampleRate * 0.02));
  let cursor = 0;

  while (samples.length - cursor > maxSamples) {
    const idealCut = cursor + maxSamples;
    const searchStart = Math.max(
      cursor + minimumChunkSamples,
      idealCut - searchSamples
    );
    let quietestCut = idealCut;
    let quietestEnergy = Number.POSITIVE_INFINITY;

    for (
      let windowStart = searchStart;
      windowStart < idealCut;
      windowStart += analysisWindow
    ) {
      const windowEnd = Math.min(windowStart + analysisWindow, idealCut);
      let energy = 0;
      for (let index = windowStart; index < windowEnd; index += 1) {
        energy += Math.abs(samples[index]);
      }
      energy /= windowEnd - windowStart;
      if (energy < quietestEnergy) {
        quietestEnergy = energy;
        quietestCut = windowEnd;
      }
    }

    chunks.push(samples.subarray(cursor, quietestCut));
    cursor = quietestCut;
  }

  if (cursor < samples.length) chunks.push(samples.subarray(cursor));
  return chunks;
}

export function formatAudioDuration(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) return "۰:۰۰";
  const rounded = Math.round(seconds);
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor((rounded % 3600) / 60);
  const remainingSeconds = rounded % 60;
  const parts = hours > 0 ? [hours, minutes, remainingSeconds] : [minutes, remainingSeconds];
  return parts
    .map((part, index) =>
      part
        .toLocaleString("fa-IR", { useGrouping: false })
        .padStart(index === 0 ? 1 : 2, "۰")
    )
    .join(":");
}

export function transcriptExportName(
  audioFileName: string,
  kind: "raw" | "corrected"
) {
  const base = audioFileName.replace(/\.[^.]+$/, "").trim() || "transcript";
  const safeBase = base.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "-");
  return `${safeBase}-${kind === "corrected" ? "corrected" : "transcript"}.txt`;
}
