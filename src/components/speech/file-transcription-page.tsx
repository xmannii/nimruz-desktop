"use client";

import { ModelPicker } from "@/components/chat/model-picker";
import { useAppShell } from "@/components/app-shell-context";
import {
  TranscriptionResultCard,
  type FileTranscriptionItem,
} from "@/components/speech/transcription-result-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldTitle,
} from "@/components/ui/field";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@/components/ui/toggle-group";
import { useShenavaModel } from "@/hooks/use-shenava-model";
import type { ProviderModelRef } from "@/lib/models/catalog";
import {
  AUDIO_FILE_ACCEPT,
  formatAudioDuration,
  MAX_AUDIO_DURATION_SECONDS,
  MAX_AUDIO_FILE_BYTES,
  isSupportedAudioFile,
  splitPcmAtSilence,
} from "@/lib/speech/file-transcription";
import {
  DEFAULT_CORRECTION_PROMPT,
  MAX_CORRECTION_PROMPT_CHARS,
} from "@/lib/speech/correction";
import { requestTranscriptCorrection } from "@/lib/speech/request-correction";
import {
  formatBytes,
  resamplePcm,
  SHENAVA_MODEL_KEYS,
  SHENAVA_MODELS,
  SHENAVA_SAMPLE_RATE,
  type ShenavaModelKey,
} from "@/lib/speech/shenava";
import { cn } from "@/lib/utils";
import { Link } from "@tanstack/react-router";
import {
  CheckIcon,
  ChevronDownIcon,
  DownloadIcon,
  FileAudioIcon,
  LockKeyholeIcon,
  MicIcon,
  SparklesIcon,
  SquareIcon,
  UploadIcon,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from "react";
import { toast } from "sonner";

const MAX_FILES_PER_BATCH = 20;

type LiveRecordingSession = {
  recorder: MediaRecorder;
  stream: MediaStream;
  elapsedTimer: number;
  maximumDurationTimer: number;
};

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

type PendingTranscription = {
  id: string;
  file: File;
  modelKey: ShenavaModelKey;
  autoCorrect: boolean;
  correctionPrompt: string;
  correctionModel: ProviderModelRef | null;
};

function downloadCombinedTranscript(items: FileTranscriptionItem[]) {
  const completed = items.filter(
    (item) => item.status === "done" && item.transcript
  );
  if (completed.length === 0) return;
  const text = completed
    .map((item) => {
      const transcript = item.correctedText ?? item.transcript;
      return `${item.file.name}\n${"=".repeat(item.file.name.length)}\n\n${transcript}`;
    })
    .join("\n\n\n");
  const url = URL.createObjectURL(
    new Blob([text], { type: "text/plain;charset=utf-8" })
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = `shenava-transcripts-${new Date().toISOString().slice(0, 10)}.txt`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

async function decodeAudio(file: File) {
  const context = new AudioContext();
  try {
    const encoded = await file.arrayBuffer();
    const decoded = await context.decodeAudioData(encoded);
    if (decoded.duration > MAX_AUDIO_DURATION_SECONDS) {
      throw new Error("مدت فایل صوتی نباید بیشتر از یک ساعت باشد.");
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
    if (error instanceof Error && error.message.includes("یک ساعت")) {
      throw error;
    }
    throw new Error(
      "این فایل صوتی قابل خواندن نیست. WAV، MP3، M4A، AAC، FLAC، OGG یا WebM را امتحان کنید."
    );
  } finally {
    await context.close().catch(() => undefined);
  }
}

export function FileTranscriptionPage() {
  const shenava = useShenavaModel();
  const { defaultModelRef, hasUsableModel } = useAppShell();
  const [items, setItems] = useState<FileTranscriptionItem[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [autoCorrect, setAutoCorrect] = useState(false);
  const [correctionPrompt, setCorrectionPrompt] = useState(
    DEFAULT_CORRECTION_PROMPT
  );
  const [correctionModel, setCorrectionModel] =
    useState<ProviderModelRef | null>(defaultModelRef);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const itemsRef = useRef<FileTranscriptionItem[]>([]);
  const queueRef = useRef<PendingTranscription[]>([]);
  const processingRef = useRef(false);
  const mountedRef = useRef(true);
  const correctionControllersRef = useRef(new Map<string, AbortController>());
  const liveRecordingRef = useRef<LiveRecordingSession | null>(null);
  const [isLiveRecording, setIsLiveRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);

  const installedModelKeys = SHENAVA_MODEL_KEYS.filter(
    (modelKey) => shenava.status.models[modelKey].installed
  );
  const activeModelInstalled =
    shenava.status.models[shenava.status.activeModelKey].installed;
  const hasCompletedItems = items.some(
    (item) => item.status === "done" && item.transcript
  );
  const hasBusyItems = items.some(
    (item) =>
      item.status === "queued" ||
      item.status === "decoding" ||
      item.status === "transcribing" ||
      item.status === "correcting"
  );
  const canUseAiCorrection = hasUsableModel && correctionModel !== null;

  useEffect(() => {
    if (!correctionModel && defaultModelRef) setCorrectionModel(defaultModelRef);
  }, [correctionModel, defaultModelRef]);

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
      aiModel: ProviderModelRef
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
          model: aiModel,
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

  useEffect(
    () => {
      mountedRef.current = true;
      return () => {
        mountedRef.current = false;
        queueRef.current = [];
        const recording = liveRecordingRef.current;
        if (recording) {
          recording.recorder.onstop = null;
          if (recording.recorder.state !== "inactive") recording.recorder.stop();
          releaseLiveRecordingSession(recording);
          liveRecordingRef.current = null;
        }
        for (const controller of correctionControllersRef.current.values()) {
          controller.abort();
        }
        for (const item of itemsRef.current) URL.revokeObjectURL(item.audioUrl);
      };
    },
    []
  );

  const addFiles = useCallback((fileList: FileList | File[]) => {
    if (!activeModelInstalled) {
      toast.error("ابتدا یک مدل شنوا را نصب و فعال کنید.");
      return;
    }

    const selected = Array.from(fileList).slice(0, MAX_FILES_PER_BATCH);
    const supported = selected.filter(isSupportedAudioFile);
    const rejectedCount = selected.length - supported.length;
    if (rejectedCount > 0) {
      toast.error(
        `${rejectedCount.toLocaleString("fa-IR")} فایل پشتیبانی نشد یا بزرگ‌تر از ${formatBytes(MAX_AUDIO_FILE_BYTES)} بود.`
      );
    }
    if (supported.length === 0) return;

    const nextItems: FileTranscriptionItem[] = [];
    const jobs: PendingTranscription[] = [];
    for (const file of supported) {
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
        modelKey: shenava.status.activeModelKey,
      });
      jobs.push({
        id,
        file,
        modelKey: shenava.status.activeModelKey,
        autoCorrect: autoCorrect && canUseAiCorrection,
        correctionPrompt,
        correctionModel,
      });
    }

    replaceItems((current) => [...nextItems, ...current]);
    queueRef.current.push(...jobs);
    void drainQueue();
  }, [
    activeModelInstalled,
    autoCorrect,
    canUseAiCorrection,
    correctionModel,
    correctionPrompt,
    drainQueue,
    replaceItems,
    shenava.status.activeModelKey,
  ]);

  function handleFileInput(event: ChangeEvent<HTMLInputElement>) {
    if (event.target.files) addFiles(event.target.files);
    event.target.value = "";
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragging(false);
    addFiles(event.dataTransfer.files);
  }

  const stopLiveRecording = useCallback(() => {
    const recording = liveRecordingRef.current;
    if (!recording || recording.recorder.state === "inactive") return;
    recording.recorder.stop();
  }, []);

  const startLiveRecording = useCallback(async () => {
    if (liveRecordingRef.current) {
      stopLiveRecording();
      return;
    }
    if (!activeModelInstalled) {
      toast.error("ابتدا یک مدل شنوا را نصب و فعال کنید.");
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      toast.error("ضبط صدا در این دستگاه در دسترس نیست.");
      return;
    }

    let stream: MediaStream | null = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          autoGainControl: true,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
        video: false,
      });
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
          toast.info("حداکثر زمان ضبط یک ساعت است؛ ضبط متوقف شد.");
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
        const file = new File(
          [audio],
          `recording-${timestamp}.${recordingFileExtension(type)}`,
          { type }
        );
        addFiles([file]);
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
      } else {
        toast.error("شروع ضبط صدا ناموفق بود.");
      }
    }
  }, [activeModelInstalled, addFiles, stopLiveRecording]);

  useEffect(() => {
    if (!isLiveRecording) return;

    const finishWithSpace = (event: KeyboardEvent) => {
      if (
        event.code !== "Space" ||
        event.repeat ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey
      ) {
        return;
      }
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        target.closest("button, input, textarea, select, [role='button']")
      ) {
        return;
      }
      event.preventDefault();
      stopLiveRecording();
    };

    window.addEventListener("keydown", finishWithSpace);
    return () => window.removeEventListener("keydown", finishWithSpace);
  }, [isLiveRecording, stopLiveRecording]);

  async function selectShenavaModel(modelKey: ShenavaModelKey) {
    try {
      await shenava.select(modelKey);
      toast.success(`مدل ${SHENAVA_MODELS[modelKey].shortName} فعال شد.`);
    } catch {
      toast.error("تغییر مدل شنوا ناموفق بود.");
    }
  }

  function runManualCorrection(id: string) {
    const item = itemsRef.current.find((candidate) => candidate.id === id);
    if (!item?.transcript || !correctionModel) return;
    void correctItem(id, item.transcript, correctionPrompt, correctionModel);
  }

  function removeItem(id: string) {
    const item = itemsRef.current.find((candidate) => candidate.id === id);
    if (item) URL.revokeObjectURL(item.audioUrl);
    queueRef.current = queueRef.current.filter((job) => job.id !== id);
    replaceItems((current) => current.filter((candidate) => candidate.id !== id));
  }

  function clearCompleted() {
    const removable = itemsRef.current.filter(
      (item) => item.status === "done" || item.status === "error"
    );
    for (const item of removable) URL.revokeObjectURL(item.audioUrl);
    const removableIds = new Set(removable.map((item) => item.id));
    replaceItems((current) =>
      current.filter((item) => !removableIds.has(item.id))
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <header
        dir="rtl"
        className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-6"
      >
        <div className="min-w-0">
          <h1 className="text-lg font-medium tracking-tight">رونویسی صوت</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            تبدیل خصوصی فایل یا ضبط زنده فارسی به متن با مدل نصب‌شده روی دستگاه
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {hasCompletedItems ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => downloadCombinedTranscript(items)}
            >
              <DownloadIcon data-icon="inline-start" />
              خروجی همه
            </Button>
          ) : null}
          {items.length > 0 && !hasBusyItems ? (
            <Button type="button" variant="ghost" onClick={clearCompleted}>
              پاک‌کردن فهرست
            </Button>
          ) : null}
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <main dir="rtl" className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 sm:px-8 sm:py-8">
          {shenava.isLoading ? (
            <div className="flex flex-col gap-4">
              <Skeleton className="h-44 w-full rounded-2xl" />
              <Skeleton className="h-56 w-full rounded-2xl" />
            </div>
          ) : installedModelKeys.length === 0 ? (
            <Empty className="min-h-96 border">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <LockKeyholeIcon />
                </EmptyMedia>
                <EmptyTitle>ابتدا یک مدل گفتار نصب کنید</EmptyTitle>
                <EmptyDescription>
                  این بخش برای رونویسی خصوصی به Shenava Rizeh یا Koochik نیاز
                  دارد. مدل داخل برنامه نیست و از تنظیمات دانلود می‌شود.
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button render={<Link to="/settings/speech" />}>
                  رفتن به تنظیمات گفتار
                </Button>
              </EmptyContent>
            </Empty>
          ) : (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept={AUDIO_FILE_ACCEPT}
                multiple
                className="sr-only"
                onChange={handleFileInput}
              />

              <Empty
                className={cn(
                  "border transition-colors",
                  items.length > 0 ? "min-h-40 p-8" : "min-h-72",
                  isDragging && "border-primary bg-muted"
                )}
                onDragEnter={(event) => {
                  event.preventDefault();
                  setIsDragging(true);
                }}
                onDragOver={(event) => event.preventDefault()}
                onDragLeave={(event) => {
                  const relatedTarget = event.relatedTarget;
                  if (
                    !(relatedTarget instanceof Node) ||
                    !event.currentTarget.contains(relatedTarget)
                  ) {
                    setIsDragging(false);
                  }
                }}
                onDrop={handleDrop}
              >
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <UploadIcon />
                  </EmptyMedia>
                <EmptyTitle>
                    {isLiveRecording
                      ? "در حال ضبط صدا"
                      : items.length > 0
                        ? "فایل‌های بیشتری اضافه کنید"
                        : "فایل صوتی را اینجا رها کنید"}
                  </EmptyTitle>
                  <EmptyDescription>
                    {isLiveRecording
                      ? "برای پایان ضبط، روی دکمه پایان بزنید یا کلید فاصله را فشار دهید."
                      : `پردازش صدا روی دستگاه انجام می‌شود. تا ${MAX_FILES_PER_BATCH.toLocaleString("fa-IR")} فایل، حداکثر ${formatBytes(MAX_AUDIO_FILE_BYTES)} و یک ساعت برای هر فایل.`}
                  </EmptyDescription>
                </EmptyHeader>
                <EmptyContent>
                  {isLiveRecording ? (
                    <div className="flex flex-col items-center gap-3">
                      <div className="flex items-center gap-2 text-sm font-medium text-destructive">
                        <span className="size-2.5 animate-pulse rounded-full bg-destructive" />
                        {formatAudioDuration(recordingSeconds)}
                      </div>
                      <Button
                        type="button"
                        variant="destructive"
                        onClick={stopLiveRecording}
                      >
                        <SquareIcon data-icon="inline-start" />
                        پایان ضبط
                      </Button>
                    </div>
                  ) : (
                    <>
                      <div className="flex flex-wrap justify-center gap-2">
                        <Button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                        >
                          <FileAudioIcon data-icon="inline-start" />
                          انتخاب فایل صوتی
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => void startLiveRecording()}
                        >
                          <MicIcon data-icon="inline-start" />
                          ضبط زنده
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        WAV · MP3 · M4A · AAC · FLAC · OGG · WebM
                      </p>
                    </>
                  )}
                </EmptyContent>
              </Empty>

              {items.length > 0 ? (
                <section
                  aria-label="فهرست رونویسی‌ها"
                  className="flex flex-col gap-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <h2 className="font-medium">فهرست رونویسی‌ها</h2>
                    <Badge variant="outline">
                      {items.length.toLocaleString("fa-IR")} فایل
                    </Badge>
                  </div>
                  {items.map((item) => (
                    <TranscriptionResultCard
                      key={item.id}
                      item={item}
                      canCorrect={canUseAiCorrection}
                      onCorrect={runManualCorrection}
                      onRemove={removeItem}
                    />
                  ))}
                </section>
              ) : null}

              <ItemGroup>
                <Item variant="muted" size="sm">
                  <ItemMedia variant="icon">
                    <CheckIcon />
                  </ItemMedia>
                  <ItemContent>
                    <ItemTitle>
                      Shenava {SHENAVA_MODELS[shenava.status.activeModelKey].shortName}
                    </ItemTitle>
                    <ItemDescription>
                      مدل فعال برای رونویسی محلی
                      {hasBusyItems ? " · پس از پایان صف قابل تغییر است" : ""}
                    </ItemDescription>
                  </ItemContent>
                  <ItemActions>
                    {installedModelKeys.length > 1 ? (
                      <ToggleGroup
                        value={[shenava.status.activeModelKey]}
                        onValueChange={(values) => {
                          const next = values[0] as ShenavaModelKey | undefined;
                          if (next) void selectShenavaModel(next);
                        }}
                        disabled={hasBusyItems}
                        variant="outline"
                        size="sm"
                        spacing={0}
                        aria-label="انتخاب مدل شنوا"
                      >
                        {installedModelKeys.map((modelKey) => (
                          <ToggleGroupItem key={modelKey} value={modelKey}>
                            {SHENAVA_MODELS[modelKey].shortName}
                          </ToggleGroupItem>
                        ))}
                      </ToggleGroup>
                    ) : (
                      <Badge variant="secondary">فعال</Badge>
                    )}
                  </ItemActions>
                </Item>

                <Collapsible open={optionsOpen} onOpenChange={setOptionsOpen}>
                  <Item variant="outline" size="sm">
                    <ItemMedia variant="icon">
                      <SparklesIcon />
                    </ItemMedia>
                    <ItemContent>
                      <ItemTitle>
                        اصلاح با هوش مصنوعی
                        <Badge variant="outline">اختیاری</Badge>
                      </ItemTitle>
                      <ItemDescription>
                        {autoCorrect
                          ? "پس از هر رونویسی، متن به‌طور خودکار اصلاح می‌شود."
                          : "متن خام حفظ می‌شود؛ در صورت نیاز اصلاح هوشمند را فعال کنید."}
                      </ItemDescription>
                    </ItemContent>
                    <ItemActions>
                      {autoCorrect ? (
                        <Badge variant="secondary">روشن</Badge>
                      ) : null}
                      <CollapsibleTrigger
                        render={<Button type="button" variant="ghost" size="sm" />}
                      >
                        تنظیمات
                        <ChevronDownIcon
                          data-icon="inline-end"
                          className={cn(
                            "transition-transform",
                            optionsOpen && "rotate-180"
                          )}
                        />
                      </CollapsibleTrigger>
                    </ItemActions>
                  </Item>

                  <CollapsibleContent>
                    <Card size="sm" className="mt-3">
                      <CardHeader>
                        <CardTitle>اصلاح متن پس از رونویسی</CardTitle>
                        <CardDescription>
                          فقط متن رونویسی‌شده به ارائه‌دهنده مدل انتخابی ارسال
                          می‌شود؛ فایل صوتی محلی می‌ماند.
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <FieldGroup>
                          <Field orientation="horizontal">
                            <FieldContent>
                              <FieldTitle>اصلاح خودکار</FieldTitle>
                              <FieldDescription>
                                متن خام همیشه کنار نسخه اصلاح‌شده حفظ می‌شود.
                              </FieldDescription>
                            </FieldContent>
                            <Switch
                              aria-label="اصلاح خودکار با هوش مصنوعی"
                              checked={autoCorrect}
                              disabled={!canUseAiCorrection}
                              onCheckedChange={setAutoCorrect}
                            />
                          </Field>

                          <Field orientation="responsive">
                            <FieldContent>
                              <FieldTitle>مدل اصلاح‌کننده</FieldTitle>
                              <FieldDescription>
                                هزینه و حریم خصوصی به ارائه‌دهنده مدل بستگی دارد.
                              </FieldDescription>
                            </FieldContent>
                            {correctionModel ? (
                              <ModelPicker
                                value={correctionModel}
                                onValueChange={setCorrectionModel}
                                disabled={hasBusyItems}
                              />
                            ) : (
                              <Button
                                variant="outline"
                                render={
                                  <Link
                                    to="/settings/models"
                                    search={{ provider: undefined }}
                                  />
                                }
                              >
                                تنظیم مدل هوش مصنوعی
                              </Button>
                            )}
                          </Field>

                          <Field>
                            <FieldLabel htmlFor="correction-prompt">
                              دستور اصلاح
                            </FieldLabel>
                            <Textarea
                              id="correction-prompt"
                              value={correctionPrompt}
                              maxLength={MAX_CORRECTION_PROMPT_CHARS}
                              rows={3}
                              onChange={(event) =>
                                setCorrectionPrompt(event.target.value)
                              }
                            />
                            <FieldDescription>
                              برای نمونه، حفظ واژه‌های تخصصی یا شیوه نشانه‌گذاری
                              را مشخص کنید.
                            </FieldDescription>
                          </Field>
                        </FieldGroup>
                      </CardContent>
                    </Card>
                  </CollapsibleContent>
                </Collapsible>
              </ItemGroup>

            </>
          )}
        </main>
      </div>
    </div>
  );
}
