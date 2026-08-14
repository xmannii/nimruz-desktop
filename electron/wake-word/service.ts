import { existsSync } from "node:fs";
import { Worker } from "node:worker_threads";
import {
  INITIAL_WAKE_WORD_STATUS,
  sanitizeWakeWordSettings,
  type WakeWordSettings,
  type WakeWordStatus,
} from "@/lib/speech/wake-word";

type WakeWordResources = {
  melModelPath: string;
  embeddingModelPath: string;
  classifierModelPath: string;
};

type WakeWordWorkerMessage =
  | { type: "ready" }
  | { type: "score"; score: number }
  | { type: "detected"; score: number }
  | { type: "error"; error: string };

type WakeWordServiceOptions = {
  workerScript: string;
  resources: WakeWordResources;
  loadSettings: () => WakeWordSettings;
  saveSettings: (value: unknown) => WakeWordSettings;
  getMainWindow: () => import("electron").BrowserWindow | null;
  getCompanionWindow: () => import("electron").BrowserWindow | null;
  activateCompanionMicrophone: () => void;
};

const STATUS_CHANNEL = "speech:wake-word:status-changed";
const ACTIVATE_CHANNEL = "speech:wake-word:activate";
const RESUME_DELAY_MS = 1_200;

function mainWindowHasSpeechTarget(window: import("electron").BrowserWindow) {
  if (!window.isFocused()) return false;
  try {
    const pathname = new URL(window.webContents.getURL()).pathname;
    return pathname === "/" || pathname.includes("/chat/");
  } catch {
    return false;
  }
}

export class WakeWordService {
  readonly #listeners = new Set<(status: WakeWordStatus) => void>();
  #worker: Worker | null = null;
  #status: WakeWordStatus = INITIAL_WAKE_WORD_STATUS;
  #resumeTimer: NodeJS.Timeout | null = null;
  #disposed = false;

  constructor(private readonly options: WakeWordServiceOptions) {}

  initialize() {
    const settings = this.options.loadSettings();
    this.#status = { ...INITIAL_WAKE_WORD_STATUS, settings };
    if (settings.enabled) this.#startWorker();
  }

  getStatus() {
    return this.#status;
  }

  onStatus(listener: (status: WakeWordStatus) => void) {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  saveSettings(value: unknown) {
    const settings = this.options.saveSettings(
      sanitizeWakeWordSettings(value)
    );
    this.#setStatus({ settings, error: null });
    if (!settings.enabled) {
      this.#stopWorker();
      this.#setStatus({
        phase: "disabled",
        captureRequested: false,
        latestScore: 0,
      });
    } else if (this.#worker) {
      this.#worker.postMessage({
        type: "configure",
        threshold: settings.threshold,
      });
      if (this.#status.phase === "error") this.#restartWorker();
    } else {
      this.#startWorker();
    }
    return this.#status;
  }

  processAudio(buffer: ArrayBuffer) {
    if (
      !this.#worker ||
      this.#status.phase !== "listening" ||
      !this.#status.captureRequested
    ) {
      return;
    }
    this.#worker.postMessage({ type: "audio", samples: buffer }, [buffer]);
  }

  reportCaptureError(error: string) {
    if (!this.#status.settings.enabled) return;
    this.#setStatus({
      phase: "error",
      captureRequested: false,
      error: error.trim() || "Microphone capture failed.",
    });
  }

  pauseForSpeech() {
    if (!this.#status.settings.enabled) return;
    this.#clearResumeTimer();
    this.#worker?.postMessage({ type: "reset" });
    this.#setStatus({
      phase: "paused",
      captureRequested: false,
      latestScore: 0,
    });
  }

  resumeAfterSpeech() {
    if (!this.#status.settings.enabled || !this.#worker) return;
    this.#clearResumeTimer();
    this.#resumeTimer = setTimeout(() => {
      this.#resumeTimer = null;
      if (!this.#status.settings.enabled || !this.#worker) return;
      this.#worker.postMessage({ type: "reset" });
      this.#setStatus({
        phase: "listening",
        captureRequested: true,
        latestScore: 0,
        error: null,
      });
    }, RESUME_DELAY_MS);
  }

  dispose() {
    this.#disposed = true;
    this.#clearResumeTimer();
    this.#stopWorker();
    this.#listeners.clear();
  }

  #startWorker() {
    if (this.#disposed || this.#worker || !this.#status.settings.enabled) return;
    const missingResource = [
      this.options.workerScript,
      this.options.resources.melModelPath,
      this.options.resources.embeddingModelPath,
      this.options.resources.classifierModelPath,
    ].find((candidate) => !existsSync(candidate));
    if (missingResource) {
      this.#setStatus({
        phase: "error",
        captureRequested: false,
        error: `Wake-word resource is missing: ${missingResource}`,
      });
      return;
    }

    this.#setStatus({ phase: "loading", captureRequested: false, error: null });
    const worker = new Worker(this.options.workerScript);
    this.#worker = worker;
    worker.on("message", (message: WakeWordWorkerMessage) => {
      if (worker !== this.#worker) return;
      this.#handleWorkerMessage(message);
    });
    worker.on("error", (error) => {
      if (worker !== this.#worker) return;
      this.#worker = null;
      this.#setStatus({
        phase: "error",
        captureRequested: false,
        error: error.message,
      });
    });
    worker.on("exit", (code) => {
      if (worker !== this.#worker) return;
      this.#worker = null;
      if (!this.#disposed && this.#status.settings.enabled && code !== 0) {
        this.#setStatus({
          phase: "error",
          captureRequested: false,
          error: `Wake-word worker stopped with code ${code}.`,
        });
      }
    });
    worker.postMessage({
      type: "initialize",
      resources: this.options.resources,
      threshold: this.#status.settings.threshold,
    });
  }

  #restartWorker() {
    this.#stopWorker();
    this.#startWorker();
  }

  #stopWorker() {
    this.#clearResumeTimer();
    const worker = this.#worker;
    this.#worker = null;
    if (worker) void worker.terminate();
  }

  #handleWorkerMessage(message: WakeWordWorkerMessage) {
    if (message.type === "ready") {
      this.#setStatus({
        phase: "listening",
        captureRequested: true,
        latestScore: 0,
        error: null,
      });
      return;
    }
    if (message.type === "error") {
      this.#setStatus({
        phase: "error",
        captureRequested: false,
        error: message.error,
      });
      return;
    }
    if (message.type === "score") {
      this.#status = { ...this.#status, latestScore: message.score };
      return;
    }
    if (this.#status.phase !== "listening") return;

    const lastDetectionAt = Date.now();
    this.#setStatus({ latestScore: message.score, lastDetectionAt });
    this.pauseForSpeech();
    const mainWindow = this.options.getMainWindow();
    if (
      mainWindow &&
      !mainWindow.isDestroyed() &&
      mainWindowHasSpeechTarget(mainWindow)
    ) {
      mainWindow.webContents.send(ACTIVATE_CHANNEL, {
        confidence: message.score,
        detectedAt: lastDetectionAt,
      });
    } else {
      this.options.activateCompanionMicrophone();
    }
  }

  #setStatus(update: Partial<WakeWordStatus>) {
    this.#status = { ...this.#status, ...update };
    for (const listener of this.#listeners) listener(this.#status);
    for (const window of [
      this.options.getMainWindow(),
      this.options.getCompanionWindow(),
    ]) {
      if (window && !window.isDestroyed()) {
        window.webContents.send(STATUS_CHANNEL, this.#status);
      }
    }
  }

  #clearResumeTimer() {
    if (!this.#resumeTimer) return;
    clearTimeout(this.#resumeTimer);
    this.#resumeTimer = null;
  }
}
