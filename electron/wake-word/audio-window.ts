import {
  WAKE_WORD_HOP_SAMPLES,
  WAKE_WORD_WINDOW_SAMPLES,
} from "@/lib/speech/wake-word";

export class RollingAudioWindow {
  readonly #samples = new Float32Array(WAKE_WORD_WINDOW_SAMPLES);
  #writeIndex = 0;
  #sampleCount = 0;
  #samplesSinceInference = 0;

  append(chunk: Float32Array) {
    for (const sample of chunk) {
      this.#samples[this.#writeIndex] = sample;
      this.#writeIndex = (this.#writeIndex + 1) % this.#samples.length;
    }
    this.#sampleCount = Math.min(
      this.#samples.length,
      this.#sampleCount + chunk.length
    );
    this.#samplesSinceInference += chunk.length;
  }

  shouldInfer() {
    if (
      this.#sampleCount < this.#samples.length ||
      this.#samplesSinceInference < WAKE_WORD_HOP_SAMPLES
    ) {
      return false;
    }
    this.#samplesSinceInference %= WAKE_WORD_HOP_SAMPLES;
    return true;
  }

  snapshot() {
    if (this.#sampleCount < this.#samples.length) return null;
    if (this.#writeIndex === 0) return this.#samples.slice();

    const output = new Float32Array(this.#samples.length);
    output.set(this.#samples.subarray(this.#writeIndex), 0);
    output.set(
      this.#samples.subarray(0, this.#writeIndex),
      this.#samples.length - this.#writeIndex
    );
    return output;
  }

  reset() {
    this.#samples.fill(0);
    this.#writeIndex = 0;
    this.#sampleCount = 0;
    this.#samplesSinceInference = 0;
  }
}

export function makeEmbeddingWindows(
  mel: Float32Array,
  frameCount: number,
  melBins = 32,
  embeddingWindow = 76,
  embeddingStride = 8,
  classifierEmbeddings = 16
) {
  const windowCount =
    Math.floor((frameCount - embeddingWindow) / embeddingStride) + 1;
  if (windowCount < classifierEmbeddings) return null;

  const elementsPerWindow = embeddingWindow * melBins;
  const output = new Float32Array(
    classifierEmbeddings * elementsPerWindow
  );
  const startWindow = windowCount - classifierEmbeddings;

  for (let batch = 0; batch < classifierEmbeddings; batch += 1) {
    const startFrame = (startWindow + batch) * embeddingStride;
    const sourceOffset = startFrame * melBins;
    output.set(
      mel.subarray(sourceOffset, sourceOffset + elementsPerWindow),
      batch * elementsPerWindow
    );
  }
  return output;
}
