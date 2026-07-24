import {
  mkdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { Worker } from "node:worker_threads";
import {
  createInitialShenavaModelStatus,
  DEFAULT_SHENAVA_MODEL_KEY,
  isShenavaModelKey,
  SHENAVA_MODEL_KEYS,
  SHENAVA_MODELS,
  SHENAVA_SAMPLE_RATE,
  type ShenavaModelDefinition,
  type ShenavaModelKey,
  type ShenavaModelStatus,
  type ShenavaStatus,
  type ShenavaTranscription,
} from "@/lib/speech/shenava";
import { downloadFileWithResume } from "./resumable-download";

const MAX_AUDIO_SECONDS = 180;

type InstallManifest = {
  modelId: string;
  revision: string;
  installedAt: string;
  license: string;
};

type SelectionFile = {
  activeModelKey: ShenavaModelKey;
};

type WorkerResponse =
  | { ok: true; text: string; durationMs: number }
  | { ok: false; error: string };

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}

function requireModelKey(value: unknown): ShenavaModelKey {
  if (!isShenavaModelKey(value)) throw new Error("Unknown Shenava model.");
  return value;
}

export class ShenavaService {
  readonly #modelsRoot: string;
  readonly #selectionPath: string;
  readonly #workerScript: string;
  readonly #listeners = new Set<(status: ShenavaStatus) => void>();
  #downloadController: AbortController | null = null;
  #downloadPromise: Promise<ShenavaStatus> | null = null;
  #downloadingModelKey: ShenavaModelKey | null = null;
  #liveStatus: ShenavaStatus | null = null;

  constructor(options: { userDataPath: string; workerScript: string }) {
    this.#modelsRoot = path.join(options.userDataPath, "models");
    this.#selectionPath = path.join(
      this.#modelsRoot,
      "shenava-active-model.json"
    );
    this.#workerScript = options.workerScript;
  }

  onStatus(listener: (status: ShenavaStatus) => void) {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  getModelDirectory(modelKey: ShenavaModelKey) {
    return path.join(this.#modelsRoot, SHENAVA_MODELS[modelKey].directoryName);
  }

  async getStatus(): Promise<ShenavaStatus> {
    if (this.#liveStatus) return this.#liveStatus;
    return this.#scanStatus();
  }

  async download(modelKeyInput: ShenavaModelKey): Promise<ShenavaStatus> {
    const modelKey = requireModelKey(modelKeyInput);
    const existing = await this.getStatus();
    if (existing.models[modelKey].installed) return this.select(modelKey);

    if (this.#downloadPromise) {
      if (this.#downloadingModelKey === modelKey) return this.#downloadPromise;
      throw new Error("Another Shenava model is already downloading.");
    }

    this.#downloadingModelKey = modelKey;
    this.#downloadPromise = this.#performDownload(modelKey, existing);
    try {
      return await this.#downloadPromise;
    } finally {
      this.#downloadPromise = null;
      this.#downloadController = null;
      this.#downloadingModelKey = null;
    }
  }

  cancelDownload() {
    this.#downloadController?.abort();
  }

  async select(modelKeyInput: ShenavaModelKey): Promise<ShenavaStatus> {
    const modelKey = requireModelKey(modelKeyInput);
    const current = await this.getStatus();
    if (!current.models[modelKey].installed) {
      throw new Error("The selected Shenava model is not installed.");
    }

    await this.#writeSelection(modelKey);
    const next = { ...current, activeModelKey: modelKey };
    this.#setAndEmit(next);
    return next;
  }

  async remove(modelKeyInput: ShenavaModelKey): Promise<ShenavaStatus> {
    const modelKey = requireModelKey(modelKeyInput);
    if (this.#downloadPromise) {
      throw new Error("Cannot remove Shenava while a model is downloading.");
    }

    await rm(this.getModelDirectory(modelKey), {
      recursive: true,
      force: true,
    });
    await rm(this.#temporaryDirectory(modelKey), {
      recursive: true,
      force: true,
    });

    this.#setLiveStatus(null);
    const next = await this.#scanStatus();
    this.#setAndEmit(next);
    return next;
  }

  async transcribe(samples: Float32Array): Promise<ShenavaTranscription> {
    const status = await this.getStatus();
    const modelKey = status.activeModelKey;
    if (!status.models[modelKey].installed) {
      throw new Error("The active Shenava model is not installed.");
    }
    if (samples.length < SHENAVA_SAMPLE_RATE / 5) {
      throw new Error("The recording is too short.");
    }
    if (samples.length > SHENAVA_SAMPLE_RATE * MAX_AUDIO_SECONDS) {
      throw new Error("The recording is too long.");
    }

    return this.#runWorker(modelKey, samples);
  }

  async #scanStatus(): Promise<ShenavaStatus> {
    const [activeSelection, modelEntries] = await Promise.all([
      this.#readSelection(),
      Promise.all(
        SHENAVA_MODEL_KEYS.map(async (modelKey) => [
          modelKey,
          await this.#readModelStatus(modelKey),
        ])
      ),
    ]);
    const models = Object.fromEntries(modelEntries) as Record<
      ShenavaModelKey,
      ShenavaModelStatus
    >;

    let activeModelKey = activeSelection;
    if (!models[activeModelKey].installed) {
      const installedFallback = SHENAVA_MODEL_KEYS.find(
        (modelKey) => models[modelKey].installed
      );
      if (installedFallback) {
        activeModelKey = installedFallback;
        await this.#writeSelection(activeModelKey);
      }
    }

    return { activeModelKey, models };
  }

  async #readModelStatus(
    modelKey: ShenavaModelKey
  ): Promise<ShenavaModelStatus> {
    const model = SHENAVA_MODELS[modelKey];
    const directory = this.getModelDirectory(modelKey);

    try {
      const [manifest, modelStats, tokenStats] = await Promise.all([
        this.#readManifest(modelKey),
        stat(path.join(directory, "model.onnx")),
        stat(path.join(directory, "tokens.txt")),
      ]);
      const installedBytes = modelStats.size + tokenStats.size;
      const valid =
        manifest.modelId === model.id &&
        manifest.revision === model.revision &&
        modelStats.isFile() &&
        tokenStats.isFile() &&
        modelStats.size === model.files[0].size &&
        tokenStats.size === model.files[1].size;

      if (valid) {
        return {
          ...createInitialShenavaModelStatus(modelKey),
          phase: "ready",
          installed: true,
          downloadedBytes: model.totalBytes,
          installedBytes,
        };
      }
    } catch {
      // Missing or incomplete model files are represented as not installed.
    }

    let downloadedBytes = 0;
    const temporaryDirectory = this.#temporaryDirectory(modelKey);
    for (const file of model.files) {
      try {
        const info = await stat(path.join(temporaryDirectory, file.name));
        if (info.isFile()) downloadedBytes += Math.min(info.size, file.size);
      } catch {
        // A missing partial file contributes no resumable bytes.
      }
    }

    return {
      ...createInitialShenavaModelStatus(modelKey),
      downloadedBytes,
    };
  }

  async #performDownload(
    modelKey: ShenavaModelKey,
    initialStatus: ShenavaStatus
  ): Promise<ShenavaStatus> {
    const model = SHENAVA_MODELS[modelKey];
    const controller = new AbortController();
    const temporaryDirectory = this.#temporaryDirectory(modelKey);
    this.#downloadController = controller;
    const fileProgress = new Map<string, number>();
    for (const file of model.files) {
      try {
        const info = await stat(path.join(temporaryDirectory, file.name));
        fileProgress.set(
          file.name,
          info.isFile() ? Math.min(info.size, file.size) : 0
        );
      } catch {
        fileProgress.set(file.name, 0);
      }
    }
    let downloadedBytes = [...fileProgress.values()].reduce(
      (total, bytes) => total + bytes,
      0
    );
    let lastEmitAt = 0;

    const updateModelStatus = (modelStatus: ShenavaModelStatus) => {
      const current = this.#liveStatus ?? initialStatus;
      this.#setAndEmit({
        ...current,
        models: { ...current.models, [modelKey]: modelStatus },
      });
    };

    const updateProgress = (fileName: string, fileBytes: number) => {
      fileProgress.set(fileName, fileBytes);
      downloadedBytes = [...fileProgress.values()].reduce(
        (total, bytes) => total + bytes,
        0
      );
      const now = Date.now();
      if (now - lastEmitAt < 100 && downloadedBytes < model.totalBytes) return;
      lastEmitAt = now;
      updateModelStatus({
        ...createInitialShenavaModelStatus(modelKey),
        phase: "downloading",
        downloadedBytes,
      });
    };

    updateModelStatus({
      ...createInitialShenavaModelStatus(modelKey),
      phase: "downloading",
      downloadedBytes,
    });

    try {
      await mkdir(temporaryDirectory, { recursive: true });

      for (const file of model.files) {
        await this.#downloadFile(
          model,
          file,
          temporaryDirectory,
          controller.signal,
          (fileBytes) => updateProgress(file.name, fileBytes)
        );
      }

      const manifest: InstallManifest = {
        modelId: model.id,
        revision: model.revision,
        installedAt: new Date().toISOString(),
        license: model.license,
      };
      await writeFile(
        path.join(temporaryDirectory, "manifest.json"),
        `${JSON.stringify(manifest, null, 2)}\n`,
        "utf8"
      );

      await rm(this.getModelDirectory(modelKey), {
        recursive: true,
        force: true,
      });
      await rename(temporaryDirectory, this.getModelDirectory(modelKey));
      await this.#writeSelection(modelKey);

      const current = this.#liveStatus ?? initialStatus;
      const ready: ShenavaStatus = {
        activeModelKey: modelKey,
        models: {
          ...current.models,
          [modelKey]: {
            ...createInitialShenavaModelStatus(modelKey),
            phase: "ready",
            installed: true,
            downloadedBytes: model.totalBytes,
            installedBytes: model.totalBytes,
          },
        },
      };
      this.#setAndEmit(ready);
      return ready;
    } catch (error) {
      const current = this.#liveStatus ?? initialStatus;
      const modelStatus = isAbortError(error)
        ? {
            ...createInitialShenavaModelStatus(modelKey),
            downloadedBytes,
          }
        : {
            ...createInitialShenavaModelStatus(modelKey),
            phase: "error" as const,
            downloadedBytes,
            error: error instanceof Error ? error.message : "Download failed.",
          };
      const next = {
        ...current,
        models: { ...current.models, [modelKey]: modelStatus },
      };
      this.#setAndEmit(next);
      if (isAbortError(error)) return next;
      throw error;
    }
  }

  async #downloadFile(
    model: ShenavaModelDefinition,
    file: ShenavaModelDefinition["files"][number],
    temporaryDirectory: string,
    signal: AbortSignal,
    onChunk: (bytes: number) => void
  ) {
    await downloadFileWithResume({
      url: `https://huggingface.co/${model.id}/resolve/${model.revision}/${file.name}`,
      destination: path.join(temporaryDirectory, file.name),
      expectedBytes: file.size,
      expectedSha256: file.sha256,
      signal,
      onProgress: onChunk,
    });
  }

  #runWorker(
    modelKey: ShenavaModelKey,
    samples: Float32Array
  ): Promise<ShenavaTranscription> {
    const copied = samples.slice();
    const modelDirectory = this.getModelDirectory(modelKey);

    return new Promise((resolve, reject) => {
      const worker = new Worker(this.#workerScript);
      let settled = false;
      const timeout = setTimeout(() => {
        if (settled) return;
        settled = true;
        reject(new Error("Shenava transcription timed out."));
        void worker.terminate();
      }, 300_000);

      const finish = () => {
        if (!settled) return;
        clearTimeout(timeout);
        void worker.terminate();
      };

      worker.once("message", (message: WorkerResponse) => {
        settled = true;
        if (message.ok) {
          resolve({ text: message.text, durationMs: message.durationMs });
        } else {
          reject(new Error(message.error));
        }
        finish();
      });
      worker.once("error", (error) => {
        settled = true;
        reject(error);
        finish();
      });
      worker.once("exit", (code) => {
        if (!settled) {
          settled = true;
          reject(new Error(`Shenava worker exited with code ${code}.`));
          finish();
        }
      });

      worker.postMessage(
        {
          modelPath: path.join(modelDirectory, "model.onnx"),
          tokensPath: path.join(modelDirectory, "tokens.txt"),
          samples: copied.buffer,
        },
        [copied.buffer]
      );
    });
  }

  async #readManifest(modelKey: ShenavaModelKey): Promise<InstallManifest> {
    const raw = await readFile(
      path.join(this.getModelDirectory(modelKey), "manifest.json"),
      "utf8"
    );
    return JSON.parse(raw) as InstallManifest;
  }

  async #readSelection(): Promise<ShenavaModelKey> {
    try {
      const raw = await readFile(this.#selectionPath, "utf8");
      const parsed = JSON.parse(raw) as Partial<SelectionFile>;
      if (isShenavaModelKey(parsed.activeModelKey)) {
        return parsed.activeModelKey;
      }
    } catch {
      // A missing or invalid preference falls back to Rizeh.
    }
    return DEFAULT_SHENAVA_MODEL_KEY;
  }

  async #writeSelection(activeModelKey: ShenavaModelKey) {
    await mkdir(this.#modelsRoot, { recursive: true });
    const selection: SelectionFile = { activeModelKey };
    await writeFile(
      this.#selectionPath,
      `${JSON.stringify(selection, null, 2)}\n`,
      "utf8"
    );
  }

  #temporaryDirectory(modelKey: ShenavaModelKey) {
    return `${this.getModelDirectory(modelKey)}.download`;
  }

  #setLiveStatus(status: ShenavaStatus | null) {
    this.#liveStatus = status;
  }

  #setAndEmit(status: ShenavaStatus) {
    this.#setLiveStatus(status);
    this.#emit(status);
  }

  #emit(status: ShenavaStatus) {
    for (const listener of this.#listeners) listener(status);
  }
}
