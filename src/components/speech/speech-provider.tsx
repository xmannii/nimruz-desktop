"use client";

import type { FileTranscriptionItem } from "@/components/speech/transcription-result-card";
import type { ProviderModelRef } from "@/lib/models/catalog";
import {
  MAX_AUDIO_DURATION_SECONDS,
  splitPcmAtSilence,
} from "@/lib/speech/file-transcription";
import { requestTranscriptCorrection } from "@/lib/speech/request-correction";
import {
  DEFAULT_MICROPHONE_ID,
  MICROPHONE_STORAGE_KEY,
  openMicrophoneStream,
  readPreferredMicrophoneId,
  savePreferredMicrophoneId,
} from "@/lib/speech/microphone";
import {
  resamplePcm,
  SHENAVA_SAMPLE_RATE,
  type ShenavaModelKey,
} from "@/lib/speech/shenava";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { toast } from "sonner";

type TranscriptionOptions = {
  modelKey: ShenavaModelKey;
  autoCorrect: boolean;
  correctionPrompt: string;
  correctionModel: ProviderModelRef | null;
};

type PendingTranscription = TranscriptionOptions & {
  id: string;
  file: File;
};

type LiveRecordingSession = {
  recorder: MediaRecorder;
  stream: MediaStream;
  elapsedTimer: number;
  maximumDurationTimer: number;
};

type SpeechContextValue = {
  microphones: MediaDeviceInfo[];
  selectedMicrophoneId: string;
  setSelectedMicrophoneId: (deviceId: string) => void;
  refreshMicrophones: () => Promise<MediaDeviceInfo[]>;
  items: FileTranscriptionItem[];
  hasBusyItems: boolean;
  addFiles: (files: File[], options: TranscriptionOptions) => void;
  correctItem: (
    id: string,
    text: string,
    prompt: string,
    model: ProviderModelRef
  ) => Promise<void>;
  removeItem: (id: string) => void;
  clearCompleted: () => void;
  isLiveRecording: boolean;
  recordingSeconds: number;
  startLiveRecording: (options: TranscriptionOptions) => Promise<void>;
  stopLiveRecording: () => void;
};

const SpeechContext = createContext<SpeechContextValue | null>(null);

function releaseLiveRecordingSession(session: LiveRecordingSession) {
  window.clearInterval(session.elapsedTimer);
  window.clearTimeout(session.maximumDurationTimer);
  for (const track of session.stream.getTracks()) track.stop();
}

function recordingFileExtension(mimeType: string) {
  if (mimeType.includes("ogg")) return "ogg";
  if (mimeType.includes("mp4")) return "m4a";
  return "webm";
}

async function decodeAudio(file: File) {
  const context = new AudioContext();
  try {
    const encoded = await file.arrayBuffer();
    const decoded = await context.decodeAudioData(encoded);
    if (decoded.duration > MAX_AUDIO_DURATION_SECONDS) {
      throw new Error("مدت فایل صوتی نباید بیشتر از دو ساعت باشد.");
    }

    const mono = new Float32Array(decoded.length);
    for (let channel = 0; channel < decoded.numberOfChannels; channel += 1) {
      const input = decoded.getChannelData(channel);
      for (let index = 0; index < input.length; index += 1) {
        mono[index] += input[index] / decoded.numberOfChannels;
      }
    }

    return {
      durationSeconds: decoded.duration,
      samples: resamplePcm(mono, decoded.sampleRate, SHENAVA_SAMPLE_RATE),
    };
  } catch (error) {
    if (error instanceof Error && error.message.includes("مدت فایل صوتی")) {
      throw error;
    }
    throw new Error(
      "این فایل صوتی قابل خواندن نیست. WAV، MP3، M4A، AAC، FLAC، OGG یا WebM را امتحان کنید."
    );
  } finally {
    await context.close().catch(() => undefined);
  }
}

export function SpeechProvider({ children }: { children: ReactNode }) {
  const [microphones, setMicrophones] = useState<MediaDeviceInfo[]>([]);
  const [selectedMicrophoneId, setSelectedMicrophoneIdState] = useState(
    readPreferredMicrophoneId
  );
  const [items, setItems] = useState<FileTranscriptionItem[]>([]);
  const [isLiveRecording, setIsLiveRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const itemsRef = useRef<FileTranscriptionItem[]>([]);
  const queueRef = useRef<PendingTranscription[]>([]);
  const processingRef = useRef(false);
  const mountedRef = useRef(true);
  const correctionControllersRef = useRef(new Map<string, AbortController>());
  const liveRecordingRef = useRef<LiveRecordingSession | null>(null);

  const setSelectedMicrophoneId = useCallback((deviceId: string) => {
    setSelectedMicrophoneIdState(deviceId);
    savePreferredMicrophoneId(deviceId);
  }, []);

  const refreshMicrophones = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) {
      setMicrophones([]);
      return [];
    }
    const devices = (await navigator.mediaDevices.enumerateDevices()).filter(
      (device) => device.kind === "audioinput"
    );
    setMicrophones(devices);
    setSelectedMicrophoneIdState((current) => {
      if (
        current !== DEFAULT_MICROPHONE_ID &&
        !devices.some((device) => device.deviceId === current)
      ) {
        savePreferredMicrophoneId(DEFAULT_MICROPHONE_ID);
        return DEFAULT_MICROPHONE_ID;
      }
      return current;
    });
    return devices;
  }, []);

  useEffect(() => {
    void refreshMicrophones().catch(() => undefined);
    const mediaDevices = navigator.mediaDevices;
    if (!mediaDevices?.addEventListener) return;
    const handleDeviceChange = () => {
      void refreshMicrophones().catch(() => undefined);
    };
    mediaDevices.addEventListener("devicechange", handleDeviceChange);
    return () =>
      mediaDevices.removeEventListener("devicechange", handleDeviceChange);
  }, [refreshMicrophones]);

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== MICROPHONE_STORAGE_KEY) return;
      setSelectedMicrophoneIdState(event.newValue || DEFAULT_MICROPHONE_ID);
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  const replaceItems = useCallback(
    (
      update: (current: FileTranscriptionItem[]) => FileTranscriptionItem[]
    ) => {
      setItems((current) => {
        const next = update(current);
        itemsRef.current = next;
        return next;
      });
    },
    []
  );

  const updateItem = useCallback(
    (id: string, update: Partial<FileTranscriptionItem>) => {
      if (!mountedRef.current) return;
      replaceItems((current) =>
        current.map((item) => (item.id === id ? { ...item, ...update } : item))
      );
    },
    [replaceItems]
  );

  const correctItem = useCallback(
    async (
      id: string,
      text: string,
      prompt: string,
      model: ProviderModelRef
    ) => {
      const controller = new AbortController();
      correctionControllersRef.current.set(id, controller);
      updateItem(id, {
        status: "correcting",
        progress: 88,
        correctionError: null,
      });
      try {
        const correctedText = await requestTranscriptCorrection({
          text,
          prompt,
          model,
          signal: controller.signal,
        });
        updateItem(id, {
          status: "done",
          progress: 100,
          correctedText,
          correctionError: null,
        });
      } catch (error) {
        if (controller.signal.aborted) return;
        updateItem(id, {
          status: "done",
          progress: 100,
          correctionError:
            error instanceof Error
              ? error.message
              : "اصلاح متن با هوش مصنوعی ناموفق بود.",
        });
      } finally {
        correctionControllersRef.current.delete(id);
      }
    },
    [updateItem]
  );

  const drainQueue = useCallback(async () => {
    if (processingRef.current) return;
    processingRef.current = true;

    try {
      while (mountedRef.current && queueRef.current.length > 0) {
        const job = queueRef.current.shift();
        if (!job) break;
        updateItem(job.id, { status: "decoding", progress: 3 });

        try {
          const decoded = await decodeAudio(job.file);
          const chunks = splitPcmAtSilence(decoded.samples);
          updateItem(job.id, {
            status: "transcribing",
            progress: 10,
            durationSeconds: decoded.durationSeconds,
          });

          const transcripts: string[] = [];
          for (let index = 0; index < chunks.length; index += 1) {
            const result = await window.desktop.speech.shenava.transcribe(
              chunks[index].slice().buffer as ArrayBuffer
            );
            if (result.text.trim()) transcripts.push(result.text.trim());
            updateItem(job.id, {
              progress: 10 + ((index + 1) / chunks.length) * 75,
            });
          }

          const transcript = transcripts.join("\n\n").trim();
          if (!transcript) {
            throw new Error("گفتار قابل‌تشخیصی در این فایل شنیده نشد.");
          }
          updateItem(job.id, {
            status: "done",
            progress: 100,
            transcript,
          });

          if (job.autoCorrect && job.correctionModel) {
            await correctItem(
              job.id,
              transcript,
              job.correctionPrompt,
              job.correctionModel
            );
          }
        } catch (error) {
          updateItem(job.id, {
            status: "error",
            progress: 100,
            error:
              error instanceof Error
                ? error.message
                : "رونویسی این فایل ناموفق بود.",
          });
        }
      }
    } finally {
      processingRef.current = false;
    }
  }, [correctItem, updateItem]);

  const addFiles = useCallback(
    (files: File[], options: TranscriptionOptions) => {
      const nextItems: FileTranscriptionItem[] = [];
      const jobs: PendingTranscription[] = [];
      for (const file of files) {
        const id = crypto.randomUUID();
        nextItems.push({
          id,
          file,
          audioUrl: URL.createObjectURL(file),
          status: "queued",
          progress: 0,
          durationSeconds: null,
          transcript: "",
          correctedText: null,
          error: null,
          correctionError: null,
          modelKey: options.modelKey,
        });
        jobs.push({ id, file, ...options });
      }

      replaceItems((current) => [...nextItems, ...current]);
      queueRef.current.push(...jobs);
      void drainQueue();
    },
    [drainQueue, replaceItems]
  );

  const stopLiveRecording = useCallback(() => {
    const recording = liveRecordingRef.current;
    if (!recording || recording.recorder.state === "inactive") return;
    recording.recorder.stop();
  }, []);

  const startLiveRecording = useCallback(
    async (options: TranscriptionOptions) => {
      if (liveRecordingRef.current) {
        stopLiveRecording();
        return;
      }
      if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
        toast.error("ضبط صدا در این دستگاه در دسترس نیست.");
        return;
      }

      let stream: MediaStream | null = null;
      try {
        stream = await openMicrophoneStream(selectedMicrophoneId);
        await refreshMicrophones().catch(() => undefined);
        const mimeType = [
          "audio/webm;codecs=opus",
          "audio/webm",
          "audio/ogg;codecs=opus",
        ].find((candidate) => MediaRecorder.isTypeSupported(candidate));
        const recorder = mimeType
          ? new MediaRecorder(stream, { mimeType })
          : new MediaRecorder(stream);
        const chunks: BlobPart[] = [];
        const session: LiveRecordingSession = {
          recorder,
          stream,
          elapsedTimer: window.setInterval(
            () => setRecordingSeconds((seconds) => seconds + 1),
            1_000
          ),
          maximumDurationTimer: window.setTimeout(() => {
            toast.info("حداکثر زمان ضبط دو ساعت است؛ ضبط متوقف شد.");
            recorder.stop();
          }, MAX_AUDIO_DURATION_SECONDS * 1_000),
        };

        recorder.ondataavailable = (event) => {
          if (event.data.size > 0) chunks.push(event.data);
        };
        recorder.onstop = () => {
          if (liveRecordingRef.current === session) {
            liveRecordingRef.current = null;
          }
          releaseLiveRecordingSession(session);
          setIsLiveRecording(false);
          setRecordingSeconds(0);
          if (!mountedRef.current) return;

          const type = recorder.mimeType || "audio/webm";
          const audio = new Blob(chunks, { type });
          if (audio.size === 0) {
            toast.info("صدای کافی ضبط نشد. دوباره تلاش کنید.");
            return;
          }
          const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
          addFiles(
            [
              new File(
                [audio],
                `recording-${timestamp}.${recordingFileExtension(type)}`,
                { type }
              ),
            ],
            options
          );
        };
        recorder.onerror = () => toast.error("ضبط صدا ناموفق بود.");
        liveRecordingRef.current = session;
        setRecordingSeconds(0);
        setIsLiveRecording(true);
        recorder.start(1_000);
      } catch (error) {
        for (const track of stream?.getTracks() ?? []) track.stop();
        if (error instanceof DOMException && error.name === "NotAllowedError") {
          toast.error("دسترسی میکروفن رد شد. آن را در تنظیمات سیستم فعال کنید.");
        } else if (
          error instanceof DOMException &&
          (error.name === "NotFoundError" ||
            error.name === "OverconstrainedError")
        ) {
          setSelectedMicrophoneId(DEFAULT_MICROPHONE_ID);
          toast.error("میکروفن انتخاب‌شده در دسترس نیست؛ میکروفن سیستم فعال شد.");
        } else {
          toast.error("شروع ضبط صدا ناموفق بود.");
        }
      }
    },
    [
      addFiles,
      refreshMicrophones,
      selectedMicrophoneId,
      setSelectedMicrophoneId,
      stopLiveRecording,
    ]
  );

  const removeItem = useCallback(
    (id: string) => {
      const item = itemsRef.current.find((candidate) => candidate.id === id);
      if (item) URL.revokeObjectURL(item.audioUrl);
      queueRef.current = queueRef.current.filter((job) => job.id !== id);
      correctionControllersRef.current.get(id)?.abort();
      replaceItems((current) =>
        current.filter((candidate) => candidate.id !== id)
      );
    },
    [replaceItems]
  );

  const clearCompleted = useCallback(() => {
    const removable = itemsRef.current.filter(
      (item) => item.status === "done" || item.status === "error"
    );
    for (const item of removable) URL.revokeObjectURL(item.audioUrl);
    const removableIds = new Set(removable.map((item) => item.id));
    replaceItems((current) =>
      current.filter((item) => !removableIds.has(item.id))
    );
  }, [replaceItems]);

  useEffect(
    () => {
      mountedRef.current = true;
      return () => {
        mountedRef.current = false;
        const recording = liveRecordingRef.current;
        if (recording) {
          recording.recorder.onstop = null;
          if (recording.recorder.state !== "inactive") recording.recorder.stop();
          releaseLiveRecordingSession(recording);
        }
        for (const controller of correctionControllersRef.current.values()) {
          controller.abort();
        }
        for (const item of itemsRef.current) URL.revokeObjectURL(item.audioUrl);
      };
    },
    []
  );

  const hasBusyItems = items.some(
    (item) =>
      item.status === "queued" ||
      item.status === "decoding" ||
      item.status === "transcribing" ||
      item.status === "correcting"
  );

  const value = useMemo<SpeechContextValue>(
    () => ({
      microphones,
      selectedMicrophoneId,
      setSelectedMicrophoneId,
      refreshMicrophones,
      items,
      hasBusyItems,
      addFiles,
      correctItem,
      removeItem,
      clearCompleted,
      isLiveRecording,
      recordingSeconds,
      startLiveRecording,
      stopLiveRecording,
    }),
    [
      addFiles,
      clearCompleted,
      correctItem,
      hasBusyItems,
      isLiveRecording,
      items,
      microphones,
      recordingSeconds,
      refreshMicrophones,
      removeItem,
      selectedMicrophoneId,
      setSelectedMicrophoneId,
      startLiveRecording,
      stopLiveRecording,
    ]
  );

  return (
    <SpeechContext.Provider value={value}>{children}</SpeechContext.Provider>
  );
}

export function useSpeech() {
  const value = useContext(SpeechContext);
  if (!value) throw new Error("useSpeech must be used within SpeechProvider");
  return value;
}
