import { parentPort } from "node:worker_threads";
import { normalizeShenavaPersianNumbers } from "@/lib/speech/shenava";

type OfflineStream = {
  acceptWaveform: (sampleRate: number, samples: Float32Array) => void;
  free: () => void;
};

type OfflineRecognizer = {
  createStream: () => OfflineStream;
  decode: (stream: OfflineStream) => void;
  getResult: (stream: OfflineStream) => { text?: string };
  free: () => void;
};

type SherpaOnnx = {
  createOfflineRecognizer: (config: unknown) => OfflineRecognizer;
};

type WorkerRequest = {
  modelPath: string;
  tokensPath: string;
  samples: ArrayBuffer;
};

if (!parentPort) throw new Error("Shenava worker requires a parent port.");

parentPort.once("message", (message: WorkerRequest) => {
  const startedAt = performance.now();
  let recognizer: OfflineRecognizer | null = null;
  let stream: OfflineStream | null = null;

  try {
    // Kept inside this short-lived worker so the runtime's memory is released
    // immediately after each transcription.
    const sherpa = require("sherpa-onnx") as SherpaOnnx;
    recognizer = sherpa.createOfflineRecognizer({
      featConfig: {
        sampleRate: 16_000,
        featureDim: 80,
      },
      modelConfig: {
        nemoCtc: { model: message.modelPath },
        tokens: message.tokensPath,
        numThreads: 1,
        debug: 0,
        provider: "cpu",
      },
      decodingMethod: "greedy_search",
    });
    stream = recognizer.createStream();
    stream.acceptWaveform(16_000, new Float32Array(message.samples));
    recognizer.decode(stream);
    const result = recognizer.getResult(stream);
    const text = normalizeShenavaPersianNumbers(result.text?.trim() ?? "");
    parentPort?.postMessage({
      ok: true,
      text,
      durationMs: Math.round(performance.now() - startedAt),
    });
  } catch (error) {
    parentPort?.postMessage({
      ok: false,
      error: error instanceof Error ? error.message : "Transcription failed.",
    });
  } finally {
    stream?.free();
    recognizer?.free();
  }
});
