"use client";

import { useAppShell } from "@/components/app-shell-context";
import { ModelPicker } from "@/components/chat/model-picker";
import { useSpeech } from "@/components/speech/speech-provider";
import type { FileTranscriptionItem } from "@/components/speech/transcription-result-card";
import {
  parseStudioModelKey,
  studioModelKey,
  useStudio,
} from "@/components/studio/studio-context";
import { studioPillClass } from "@/components/studio/studio-controls";
import { StudioExpandableText, textStats } from "@/components/studio/studio-expandable-text";
import { StudioEmptyState } from "@/components/studio/studio-feed";
import {
  StudioModelPicker,
  type StudioModelOption,
} from "@/components/studio/studio-model-picker";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useShenavaModel } from "@/hooks/use-shenava-model";
import { useStudioCatalog } from "@/hooks/use-studio-catalog";
import { useStudioConnections } from "@/hooks/use-studio-connections";
import { useStudioAssistantModel } from "@/hooks/use-studio-assistant-model";
import { useStudioItems } from "@/hooks/use-studio-items";
import { useTranscriptionModelOptions } from "@/hooks/use-studio-model-options";
import { copyText } from "@/lib/studio/actions";
import {
  formatRelativeTime,
  formatStudioDuration,
  groupStudioItemsByDate,
  isStudioItemBusy,
  studioMediaUrl,
} from "@/lib/studio/format";
import { loadStudioPreferences, saveStudioPreferences } from "@/lib/studio/preferences";
import type { StudioItem } from "@/lib/studio/types";
import { DEFAULT_CORRECTION_PROMPT, MAX_CORRECTION_PROMPT_CHARS } from "@/lib/speech/correction";
import {
  AUDIO_FILE_ACCEPT,
  audioMimeTypeFor,
  formatAudioDuration,
  isSupportedAudioFile,
  MAX_AUDIO_FILE_BYTES,
  transcriptExportName,
} from "@/lib/speech/file-transcription";
import { requestTranscriptCorrection } from "@/lib/speech/request-correction";
import {
  formatBytes,
  SHENAVA_MODEL_KEYS,
  SHENAVA_MODELS,
  type ShenavaModelKey,
} from "@/lib/speech/shenava";
import { cn } from "@/lib/utils";
import { Link } from "@tanstack/react-router";
import {
  AlertTriangleIcon,
  CopyIcon,
  DownloadIcon,
  FileAudioIcon,
  MaximizeIcon,
  MicIcon,
  PauseIcon,
  PlayIcon,
  PlugIcon,
  SparklesIcon,
  SquareIcon,
  Trash2Icon,
  UploadIcon,
  WandIcon,
  XIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { toast } from "sonner";

const MAX_FILES_PER_BATCH = 20;
let activeAudio: HTMLAudioElement | null = null;

function downloadText(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** Reads the duration of an audio file without decoding all of it. */
function probeDuration(file: File) {
  return new Promise<number | null>((resolve) => {
    const url = URL.createObjectURL(file);
    const audio = new Audio();
    const done = (value: number | null) => {
      URL.revokeObjectURL(url);
      resolve(value);
    };
    audio.preload = "metadata";
    audio.onloadedmetadata = () => done(Number.isFinite(audio.duration) ? audio.duration : null);
    audio.onerror = () => done(null);
    audio.src = url;
  });
}

function useElapsed(since: number, active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [active]);
  return Math.max(0, Math.floor((now - since) / 1_000));
}

const SESSION_STATUS_LABELS: Record<FileTranscriptionItem["status"], string> = {
  queued: "در صف",
  decoding: "در حال خواندن فایل",
  transcribing: "در حال رونویسی",
  correcting: "در حال اصلاح با هوش مصنوعی",
  done: "آماده",
  error: "ناموفق",
};

/** A file still in the local Shenava queue (not yet saved to history). */
function SessionRow({ item, onRemove }: { item: FileTranscriptionItem; onRemove: (id: string) => void }) {
  const failed = item.status === "error";
  return (
    <article className="flex items-start gap-3 rounded-xl px-2 py-2.5">
      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-muted">
        {failed ? <AlertTriangleIcon className="size-3.5 text-destructive" /> : <Spinner className="size-3.5" />}
      </span>
      <div className="min-w-0 flex-1">
        <p dir="auto" className="truncate text-[13.5px] font-medium">{item.file.name}</p>
        <p className={cn("mt-0.5 text-[11px]", failed ? "text-destructive" : "text-muted-foreground")}>
          {failed ? item.error : `${SESSION_STATUS_LABELS[item.status]} · شنوا · ${formatBytes(item.file.size)}`}
        </p>
        {!failed ? (
          <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-foreground/10" dir="ltr">
            <div className="h-full rounded-full bg-foreground/50 transition-[width] duration-500" style={{ width: `${Math.max(3, item.progress)}%` }} />
          </div>
        ) : null}
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={failed ? "حذف" : "لغو"}
        title={failed ? "حذف" : "لغو"}
        onClick={() => onRemove(item.id)}
      >
        <XIcon />
      </Button>
    </article>
  );
}

function TranscriptRow({ item, modelLabel }: { item: StudioItem; modelLabel: string }) {
  const { openItem } = useStudio();
  const { model: defaultModelRef, label: assistantLabel } = useStudioAssistantModel();
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isCorrecting, setIsCorrecting] = useState(false);
  const busy = isStudioItemBusy(item);
  const failed = item.status === "failed" || item.status === "interrupted";
  const elapsed = useElapsed(item.createdAt, busy);
  const text = item.correctedText ?? item.text ?? "";
  const stats = text ? textStats(text) : null;
  const duration = formatStudioDuration(item.durationSeconds);

  function toggle() {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      if (activeAudio && activeAudio !== audio) activeAudio.pause();
      activeAudio = audio;
      void audio.play().catch(() => setIsPlaying(false));
    } else {
      audio.pause();
    }
  }

  async function correct() {
    if (!item.text || !defaultModelRef) return;
    setIsCorrecting(true);
    try {
      const correctedText = await requestTranscriptCorrection({
        text: item.text,
        prompt: DEFAULT_CORRECTION_PROMPT,
        model: defaultModelRef,
      });
      await window.desktop.studio.updateTranscript(item.id, { correctedText });
      toast.success("متن اصلاح شد.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "اصلاح متن ناموفق بود.");
    } finally {
      setIsCorrecting(false);
    }
  }

  return (
    <article className="group/row flex items-start gap-3 rounded-xl px-2 py-2.5 transition-colors hover:bg-muted/50">
      {item.hasMedia && !busy ? (
        <>
          <audio
            ref={audioRef}
            src={studioMediaUrl(item)}
            preload="none"
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            onEnded={() => setIsPlaying(false)}
          />
          <Button
            type="button"
            size="icon-sm"
            variant={isPlaying ? "default" : "secondary"}
            className="mt-0.5 shrink-0 rounded-full"
            aria-label={isPlaying ? "توقف" : "پخش صدا"}
            onClick={toggle}
          >
            {isPlaying ? <PauseIcon /> : <PlayIcon className="translate-x-px" />}
          </Button>
        </>
      ) : (
        <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-muted">
          {busy ? (
            <Spinner className="size-3.5" />
          ) : failed ? (
            <AlertTriangleIcon className="size-3.5 text-destructive" />
          ) : (
            <FileAudioIcon className="size-3.5 text-muted-foreground" />
          )}
        </span>
      )}

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p dir="auto" className="truncate text-[13px] font-medium">{item.title}</p>
          {item.correctedText ? (
            <span className="shrink-0 rounded-full bg-muted px-1.5 py-px text-[10px] text-muted-foreground">اصلاح‌شده</span>
          ) : null}
        </div>
        {busy ? (
          <p className="mt-0.5 text-[11.5px] text-muted-foreground">
            در حال رونویسی با {modelLabel}… <span className="tabular-nums">{formatAudioDuration(elapsed)}</span>
          </p>
        ) : failed ? (
          <p className="mt-0.5 line-clamp-2 text-[11.5px] text-destructive">{item.error ?? "رونویسی ناموفق بود."}</p>
        ) : text ? (
          <StudioExpandableText text={text} className="mt-0.5" />
        ) : null}
        {!busy && !failed ? (
          <div className="mt-1 flex flex-wrap items-center gap-x-1.5 text-[11px] text-muted-foreground">
            <span>{modelLabel}</span>
            {duration ? (
              <>
                <span aria-hidden>·</span>
                <span className="tabular-nums">{duration}</span>
              </>
            ) : null}
            {stats ? (
              <>
                <span aria-hidden>·</span>
                <span>{stats.words.toLocaleString("fa-IR")} واژه</span>
              </>
            ) : null}
            <span aria-hidden>·</span>
            <time dateTime={new Date(item.createdAt).toISOString()}>{formatRelativeTime(item.createdAt)}</time>
          </div>
        ) : null}
      </div>

      <div className="flex shrink-0 items-center opacity-0 transition-opacity group-hover/row:opacity-100 group-focus-within/row:opacity-100">
        {text ? (
          <>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="کپی متن"
              title="کپی متن"
              onClick={async () => {
                try {
                  await copyText(text);
                  toast.success("متن کپی شد.");
                } catch {
                  toast.error("کپی ناموفق بود.");
                }
              }}
            >
              <CopyIcon />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="اصلاح با هوش مصنوعی"
              title={defaultModelRef ? `اصلاح با هوش مصنوعی · ${assistantLabel}` : "برای اصلاح یک مدل گفتگو فعال کنید"}
              disabled={!defaultModelRef || isCorrecting}
              onClick={() => void correct()}
            >
              {isCorrecting ? <Spinner /> : <SparklesIcon />}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="ذخیره متن"
              title="ذخیره متن"
              onClick={() =>
                downloadText(
                  transcriptExportName(String(item.params.sourceName ?? item.title), item.correctedText ? "corrected" : "raw"),
                  text
                )
              }
            >
              <DownloadIcon />
            </Button>
          </>
        ) : null}
        <Button type="button" variant="ghost" size="icon-sm" aria-label="باز کردن" title="باز کردن" onClick={() => openItem(item)}>
          <MaximizeIcon />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="حذف"
          title="حذف"
          onClick={() => void window.desktop.studio.delete(item.id)}
        >
          <Trash2Icon />
        </Button>
      </div>
    </article>
  );
}

export function TranscribeStudio() {
  const { openConnections } = useStudio();
  const shenava = useShenavaModel();
  const speech = useSpeech();
  const { hasUsableModel } = useAppShell();
  const assistant = useStudioAssistantModel();
  const correctionModel = assistant.model;
  const { catalog, isLoading: catalogLoading, refresh } = useStudioCatalog();
  const { connections } = useStudioConnections();
  const { items, isLoading, hasMore, loadMore } = useStudioItems({ kind: "transcript" });
  const preferences = useMemo(loadStudioPreferences, []);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [autoCorrect, setAutoCorrect] = useState(preferences.transcribeAutoCorrect ?? false);
  const [correctionPrompt, setCorrectionPrompt] = useState(DEFAULT_CORRECTION_PROMPT);
  const [instructions, setInstructions] = useState("");
  const [showInstructions, setShowInstructions] = useState(false);
  const [modelKey, setModelKey] = useState<string | null>(preferences.transcribeModelKey ?? null);

  const installed = SHENAVA_MODEL_KEYS.filter((key) => shenava.status.models[key].installed);
  const cloudOptions = useTranscriptionModelOptions(catalog?.transcription ?? []);
  const options = useMemo<StudioModelOption[]>(
    () => [
      ...installed.map((key, index) => ({
        key: studioModelKey("shenava", key),
        id: key,
        name: SHENAVA_MODELS[key].displayName,
        provider: "shenava",
        group: "shenava",
        rank: index === 0 ? -1 : null,
        meta: "روی همین دستگاه · کاملاً خصوصی",
      })),
      ...cloudOptions,
    ],
    [installed, cloudOptions]
  );

  // Default to the active local model, else the best cloud model.
  useEffect(() => {
    if (modelKey && options.some((option) => option.key === modelKey)) return;
    const activeLocal = installed.includes(shenava.status.activeModelKey)
      ? studioModelKey("shenava", shenava.status.activeModelKey)
      : null;
    const fallback =
      activeLocal ??
      options.filter((option) => typeof option.rank === "number").sort((a, b) => a.rank! - b.rank!)[0]?.key ??
      options[0]?.key ??
      null;
    if (fallback) setModelKey(fallback);
  }, [modelKey, options, installed, shenava.status.activeModelKey]);

  const selected = modelKey ? parseStudioModelKey(modelKey) : null;
  const isLocal = selected?.provider === "shenava";
  const selectedOption = options.find((option) => option.key === modelKey);
  const canCorrect = hasUsableModel && correctionModel !== null;

  async function chooseModel(key: string) {
    setModelKey(key);
    saveStudioPreferences({ transcribeModelKey: key });
    const { provider, modelId } = parseStudioModelKey(key);
    if (provider === "shenava" && modelId !== shenava.status.activeModelKey) {
      try {
        await shenava.select(modelId as ShenavaModelKey);
      } catch {
        toast.error("تغییر مدل شنوا ناموفق بود.");
      }
    }
  }

  const sendToCloud = useCallback(
    async (files: File[]) => {
      if (!selected || selected.provider !== "google") return;
      for (const file of files) {
        const mimeType = audioMimeTypeFor(file);
        if (!mimeType) {
          toast.error(`قالب «${file.name}» پشتیبانی نمی‌شود.`);
          continue;
        }
        try {
          await window.desktop.studio.transcribeRemote({
            provider: "google",
            modelId: selected.modelId,
            sourceName: file.name,
            mimeType,
            audio: await file.arrayBuffer(),
            durationSeconds: await probeDuration(file),
            instructions: instructions.trim() || undefined,
          });
        } catch (error) {
          toast.error(error instanceof Error ? error.message : "شروع رونویسی ناموفق بود.");
        }
      }
    },
    [selected, instructions]
  );

  const addFiles = useCallback(
    (fileList: FileList | File[]) => {
      if (!selected) {
        toast.error("ابتدا یک مدل رونویسی انتخاب کنید.");
        return;
      }
      const chosen = Array.from(fileList).slice(0, MAX_FILES_PER_BATCH);
      const supported = chosen.filter(isSupportedAudioFile);
      if (supported.length < chosen.length) {
        toast.error(
          `${(chosen.length - supported.length).toLocaleString("fa-IR")} فایل پشتیبانی نشد یا بزرگ‌تر از ${formatBytes(MAX_AUDIO_FILE_BYTES)} بود.`
        );
      }
      if (supported.length === 0) return;
      if (isLocal) {
        speech.addFiles(supported, {
          modelKey: selected.modelId as ShenavaModelKey,
          autoCorrect: autoCorrect && canCorrect,
          correctionPrompt,
          correctionModel,
        });
      } else {
        void sendToCloud(supported);
      }
    },
    [selected, isLocal, speech, autoCorrect, canCorrect, correctionPrompt, correctionModel, sendToCloud]
  );

  async function startRecording() {
    if (!selected) return;
    await speech.startLiveRecording(
      {
        modelKey: (isLocal ? selected.modelId : shenava.status.activeModelKey) as ShenavaModelKey,
        autoCorrect: isLocal && autoCorrect && canCorrect,
        correctionPrompt,
        correctionModel,
      },
      isLocal ? undefined : (file) => void sendToCloud([file])
    );
  }

  // Space ends a live recording, as before.
  useEffect(() => {
    if (!speech.isLiveRecording) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.code !== "Space" || event.repeat || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      if (event.target instanceof HTMLElement && event.target.closest("button, input, textarea, select, [role='button']")) return;
      event.preventDefault();
      speech.stopLiveRecording();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [speech]);

  const sessionRows = speech.items.filter((item) => item.status !== "done");
  const sessionIds = new Set(sessionRows.map((item) => item.id));
  const history = items.filter((item) => !sessionIds.has(item.id));
  const googleConnected = connections?.google.configured === true;
  const nothingAvailable = !shenava.isLoading && installed.length === 0 && !googleConnected;

  function modelLabelFor(item: StudioItem) {
    if (item.provider === "shenava") {
      const model = SHENAVA_MODELS[item.modelId as ShenavaModelKey];
      return model ? `شنوا ${model.shortName}` : "شنوا";
    }
    return item.modelId;
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragging(false);
    addFiles(event.dataTransfer.files);
  }

  return (
    <div
      className="relative flex h-full min-h-0 flex-col"
      onDragEnter={(event) => {
        if (Array.from(event.dataTransfer.types).includes("Files")) setIsDragging(true);
      }}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={(event) => {
        if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) {
          setIsDragging(false);
        }
      }}
      onDrop={handleDrop}
    >
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col px-4 py-5 sm:px-6">
          {isLoading && items.length === 0 && sessionRows.length === 0 ? (
            <div className="flex flex-col gap-2">
              {Array.from({ length: 4 }, (_, index) => (
                <Skeleton key={index} className="h-16 rounded-xl" />
              ))}
            </div>
          ) : history.length === 0 && sessionRows.length === 0 ? (
            <div className="my-auto">
              <StudioEmptyState
                icon={<FileAudioIcon />}
                title={nothingAvailable ? "یک موتور رونویسی انتخاب کنید" : "اولین رونویسی‌تان را شروع کنید"}
                description={
                  nothingAvailable
                    ? "شنوا را برای رونویسی خصوصی روی همین دستگاه نصب کنید، یا Google AI Studio را برای رونویسی ابری با Gemini وصل کنید."
                    : "فایل صوتی را بکشید یا انتخاب کنید، یا با میکروفن ضبط کنید."
                }
              />
            </div>
          ) : (
            <div className="flex flex-col gap-5">
              {sessionRows.length > 0 ? (
                <section className="flex flex-col">
                  <h2 className="mb-1 px-2 text-xs font-medium text-muted-foreground">در حال پردازش</h2>
                  {sessionRows.map((item) => (
                    <SessionRow key={item.id} item={item} onRemove={speech.removeItem} />
                  ))}
                </section>
              ) : null}
              {groupStudioItemsByDate(history).map((group) => (
                <section key={group.label} className="flex flex-col">
                  <h2 className="mb-1 px-2 text-xs font-medium text-muted-foreground">{group.label}</h2>
                  {group.items.map((item) => (
                    <TranscriptRow key={item.id} item={item} modelLabel={modelLabelFor(item)} />
                  ))}
                </section>
              ))}
              {hasMore ? (
                <Button type="button" variant="ghost" size="sm" className="self-center" onClick={loadMore}>
                  موارد قدیمی‌تر
                </Button>
              ) : null}
            </div>
          )}
        </div>
      </div>

      {nothingAvailable ? (
        <div className="shrink-0 border-t border-border/60 bg-background px-4 py-3 sm:px-6">
          <div className="mx-auto flex w-full max-w-3xl flex-wrap items-center gap-3 rounded-3xl border border-border bg-card px-4 py-3 shadow-xs">
            <FileAudioIcon className="size-4 shrink-0 text-muted-foreground" />
            <p className="min-w-0 flex-1 text-[13px] text-muted-foreground">
              برای رونویسی، شنوا (روی دستگاه) یا Google AI Studio (Gemini) لازم است.
            </p>
            <Button size="sm" className="rounded-full" render={<Link to="/settings/speech" />}>
              نصب شنوا
            </Button>
            <Button size="sm" variant="outline" className="rounded-full" onClick={openConnections}>
              <PlugIcon data-icon="inline-start" />
              اتصال Google
            </Button>
          </div>
        </div>
      ) : (
        <div className="shrink-0 border-t border-border/60 bg-background px-4 pt-3 pb-3 sm:px-6">
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-2">
            <div className="flex flex-col rounded-3xl border border-border bg-card shadow-xs">
              {speech.isLiveRecording ? (
                <div className="flex items-center gap-3 px-4 py-3.5">
                  <Button
                    type="button"
                    variant="destructive"
                    size="icon"
                    className="size-9 rounded-full"
                    aria-label="پایان ضبط"
                    onClick={speech.stopLiveRecording}
                  >
                    <SquareIcon className="size-3.5 fill-current" />
                  </Button>
                  <span className="flex items-center gap-2 text-sm font-medium">
                    <span className="size-2 animate-pulse rounded-full bg-destructive" />
                    در حال ضبط
                    <span className="tabular-nums text-muted-foreground">{formatAudioDuration(speech.recordingSeconds)}</span>
                  </span>
                  <span className="ms-auto text-xs text-muted-foreground">برای پایان، کلید فاصله را بزنید</span>
                </div>
              ) : (
                <>
                  {showInstructions && !isLocal ? (
                    <div className="px-3 pt-3">
                      <div className="flex items-center gap-2 rounded-xl bg-muted/70 px-3">
                        <WandIcon className="size-3.5 shrink-0 text-muted-foreground" />
                        <input
                          dir={instructions.trim() ? "auto" : "rtl"}
                          value={instructions}
                          maxLength={1_000}
                          placeholder="نام‌ها و اصطلاحات خاص برای نوشتن درست؛ مثلاً: نیمروز، OpenRouter"
                          aria-label="راهنمای رونویسی"
                          className="h-9 min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground/70"
                          onChange={(event) => setInstructions(event.target.value)}
                        />
                        <button
                          type="button"
                          aria-label="حذف راهنما"
                          className="flex size-5 items-center justify-center rounded-full text-muted-foreground hover:bg-background hover:text-foreground"
                          onClick={() => {
                            setInstructions("");
                            setShowInstructions(false);
                          }}
                        >
                          <XIcon className="size-3" />
                        </button>
                      </div>
                    </div>
                  ) : null}
                  <div className="flex items-center gap-3 px-4 pt-3.5 pb-1">
                    <UploadIcon className="size-4 shrink-0 text-muted-foreground" />
                    <p className="text-[14px] text-muted-foreground">
                      فایل صوتی را اینجا بکشید، یا انتخاب یا ضبط کنید
                    </p>
                  </div>
                  <div className="flex items-end gap-2 px-2.5 pb-2.5 pt-2">
                    <div className="flex shrink-0 items-center gap-1.5">
                      <Button type="button" className="h-9 rounded-full px-4" disabled={!selected} onClick={() => fileInputRef.current?.click()}>
                        <FileAudioIcon data-icon="inline-start" />
                        انتخاب فایل
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        className="h-9 rounded-full px-3.5"
                        disabled={!selected}
                        onClick={() => void startRecording()}
                      >
                        <MicIcon data-icon="inline-start" />
                        ضبط
                      </Button>
                    </div>
                    <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-1.5">
                      <StudioModelPicker
                        options={options}
                        value={modelKey}
                        onValueChange={(key) => void chooseModel(key)}
                        isLoading={shenava.isLoading || catalogLoading}
                        onRefresh={() => void refresh()}
                        disabled={speech.hasBusyItems}
                        footer={
                          <div className="flex flex-col">
                            <Button type="button" variant="ghost" size="sm" className="w-full justify-start" onClick={openConnections}>
                              <PlugIcon data-icon="inline-start" />
                              اتصال Google AI Studio برای Gemini
                            </Button>
                            <Button type="button" variant="ghost" size="sm" className="w-full justify-start" render={<Link to="/settings/speech" />}>
                              <MicIcon data-icon="inline-start" />
                              مدیریت مدل‌های شنوا
                            </Button>
                          </div>
                        }
                      />
                      {!isLocal && !showInstructions ? (
                        <button type="button" className={studioPillClass} onClick={() => setShowInstructions(true)} title="نام‌ها و اصطلاحات خاص">
                          <WandIcon className="size-3.5 opacity-70" />
                          راهنما
                        </button>
                      ) : null}
                      {isLocal ? (
                        <Popover>
                          <PopoverTrigger
                            className={cn(studioPillClass, autoCorrect && canCorrect && "bg-foreground/10 text-foreground")}
                            title="اصلاح خودکار متن با هوش مصنوعی"
                          >
                            <SparklesIcon className="size-3.5 opacity-70" />
                            {autoCorrect && canCorrect ? "اصلاح خودکار" : "اصلاح"}
                          </PopoverTrigger>
                          <PopoverContent side="top" align="end" className="w-80 gap-3 rounded-2xl p-3" dir="rtl">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="text-sm font-medium">اصلاح خودکار</p>
                                <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
                                  پس از رونویسی، متن با مدل گفتگو اصلاح می‌شود؛ متن خام هم نگه داشته می‌شود. فقط متن ارسال می‌شود، نه صدا.
                                </p>
                              </div>
                              <Switch
                                aria-label="اصلاح خودکار"
                                checked={autoCorrect}
                                disabled={!canCorrect}
                                onCheckedChange={(value) => {
                                  setAutoCorrect(value);
                                  saveStudioPreferences({ transcribeAutoCorrect: value });
                                }}
                              />
                            </div>
                            {correctionModel ? (
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-xs text-muted-foreground">مدل دستیار</span>
                                <ModelPicker
                                  value={correctionModel}
                                  onValueChange={assistant.setModel}
                                  heading="مدل دستیار"
                                  description="همین مدل برای بهبود درخواست‌ها و برچسب‌های صوتی هم استفاده می‌شود."
                                  align="end"
                                  disabled={speech.hasBusyItems}
                                />
                              </div>
                            ) : null}
                            <Textarea
                              value={correctionPrompt}
                              maxLength={MAX_CORRECTION_PROMPT_CHARS}
                              rows={3}
                              aria-label="دستور اصلاح"
                              className="resize-none text-xs leading-6"
                              onChange={(event) => setCorrectionPrompt(event.target.value)}
                            />
                          </PopoverContent>
                        </Popover>
                      ) : null}
                    </div>
                  </div>
                </>
              )}
            </div>
            <div className="flex items-center justify-between px-3 text-[11px] text-muted-foreground/80">
              <span>WAV · MP3 · M4A · AAC · FLAC · OGG · WebM — تا {formatBytes(MAX_AUDIO_FILE_BYTES)}</span>
              <span>{isLocal ? "پردازش روی همین دستگاه" : selectedOption ? "پردازش در Google AI Studio" : null}</span>
            </div>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept={AUDIO_FILE_ACCEPT}
            multiple
            className="sr-only"
            onChange={(event) => {
              if (event.target.files) addFiles(event.target.files);
              event.target.value = "";
            }}
          />
        </div>
      )}

      {isDragging && !nothingAvailable ? (
        <div className="pointer-events-none absolute inset-3 z-20 flex items-center justify-center rounded-2xl border-2 border-dashed border-foreground/30 bg-background/90">
          <div className="flex flex-col items-center gap-2 text-center">
            <UploadIcon className="size-7 text-muted-foreground" />
            <p className="text-sm font-medium">فایل صوتی را اینجا رها کنید</p>
            <p className="text-xs text-muted-foreground">
              {isLocal ? "رونویسی خصوصی روی همین دستگاه" : "رونویسی با Gemini"}
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}

