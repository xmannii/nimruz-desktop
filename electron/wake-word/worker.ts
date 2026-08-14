import { parentPort } from "node:worker_threads";
import * as ort from "onnxruntime-node";
import { RollingAudioWindow, makeEmbeddingWindows } from "./audio-window";

type WorkerResources = {
  melModelPath: string;
  embeddingModelPath: string;
  classifierModelPath: string;
};

type WorkerRequest =
  | { type: "initialize"; resources: WorkerResources; threshold: number }
  | { type: "configure"; threshold: number }
  | { type: "audio"; samples: ArrayBuffer }
  | { type: "reset" };

type WorkerResponse =
  | { type: "ready" }
  | { type: "score"; score: number }
  | { type: "detected"; score: number }
  | { type: "error"; error: string };

const EMBEDDING_WINDOW = 76;
const EMBEDDING_DIM = 96;
const MEL_BINS = 32;
const CLASSIFIER_EMBEDDINGS = 16;

if (!parentPort) throw new Error("Wake-word worker requires a parent port.");

const rollingAudio = new RollingAudioWindow();
let melSession: ort.InferenceSession | null = null;
let embeddingSession: ort.InferenceSession | null = null;
let classifierSession: ort.InferenceSession | null = null;
let threshold = 0.73;
let work = Promise.resolve();

function post(message: WorkerResponse) {
  parentPort?.postMessage(message);
}

async function createSession(modelPath: string) {
  return ort.InferenceSession.create(modelPath, {
    executionProviders: ["cpu"],
    graphOptimizationLevel: "all",
    intraOpNumThreads: 1,
    interOpNumThreads: 1,
  });
}

async function initialize(resources: WorkerResources) {
  [melSession, embeddingSession, classifierSession] = await Promise.all([
    createSession(resources.melModelPath),
    createSession(resources.embeddingModelPath),
    createSession(resources.classifierModelPath),
  ]);
  rollingAudio.reset();
  post({ type: "ready" });
}

async function predict(audio: Float32Array) {
  if (!melSession || !embeddingSession || !classifierSession) return;

  const melResult = await melSession.run({
    [melSession.inputNames[0]]: new ort.Tensor("float32", audio, [1, audio.length]),
  });
  const melOutput = melResult[melSession.outputNames[0]];
  if (!(melOutput?.data instanceof Float32Array)) {
    throw new Error("Wake-word mel model returned an invalid tensor.");
  }
  const frameCount = melOutput.dims.at(-2);
  if (!frameCount || melOutput.dims.at(-1) !== MEL_BINS) {
    throw new Error(`Unexpected wake-word mel shape: ${melOutput.dims.join("x")}`);
  }

  const normalizedMel = melOutput.data.slice();
  for (let index = 0; index < normalizedMel.length; index += 1) {
    normalizedMel[index] = normalizedMel[index] / 10 + 2;
  }
  const windows = makeEmbeddingWindows(normalizedMel, frameCount);
  if (!windows) {
    post({ type: "score", score: 0 });
    return;
  }

  const embeddingResult = await embeddingSession.run({
    [embeddingSession.inputNames[0]]: new ort.Tensor("float32", windows, [
      CLASSIFIER_EMBEDDINGS,
      EMBEDDING_WINDOW,
      MEL_BINS,
      1,
    ]),
  });
  const embeddingOutput = embeddingResult[embeddingSession.outputNames[0]];
  if (!(embeddingOutput?.data instanceof Float32Array)) {
    throw new Error("Wake-word embedding model returned an invalid tensor.");
  }
  if (embeddingOutput.data.length !== CLASSIFIER_EMBEDDINGS * EMBEDDING_DIM) {
    throw new Error(
      `Unexpected wake-word embedding size: ${embeddingOutput.data.length}`
    );
  }

  const classifierResult = await classifierSession.run({
    [classifierSession.inputNames[0]]: new ort.Tensor(
      "float32",
      embeddingOutput.data,
      [1, CLASSIFIER_EMBEDDINGS, EMBEDDING_DIM]
    ),
  });
  const classifierOutput = classifierResult[classifierSession.outputNames[0]];
  const value = classifierOutput?.data[0];
  const score = typeof value === "number" ? value : Number(value ?? 0);
  if (!Number.isFinite(score)) {
    throw new Error("Wake-word classifier returned an invalid score.");
  }

  post(score >= threshold ? { type: "detected", score } : { type: "score", score });
}

async function handle(message: WorkerRequest) {
  if (message.type === "initialize") {
    threshold = message.threshold;
    await initialize(message.resources);
    return;
  }
  if (message.type === "configure") {
    threshold = message.threshold;
    return;
  }
  if (message.type === "reset") {
    rollingAudio.reset();
    return;
  }
  if (message.type === "audio") {
    const samples = new Float32Array(message.samples);
    rollingAudio.append(samples);
    if (!rollingAudio.shouldInfer()) return;
    const snapshot = rollingAudio.snapshot();
    if (snapshot) await predict(snapshot);
  }
}

parentPort.on("message", (message: WorkerRequest) => {
  work = work
    .then(() => handle(message))
    .catch((error) => {
      post({
        type: "error",
        error: error instanceof Error ? error.message : "Wake-word inference failed.",
      });
    });
});
