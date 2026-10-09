"use client";

import { useStudio, parseStudioModelKey, studioModelKey } from "@/components/studio/studio-context";
import { StudioComposer } from "@/components/studio/studio-composer";
import { StudioExpandableText } from "@/components/studio/studio-expandable-text";
import { StudioAudioTagText } from "@/components/studio/studio-audio-tag-text";
import { StudioOptionChip, studioPillClass } from "@/components/studio/studio-controls";
import { StudioEmptyState } from "@/components/studio/studio-feed";
import { StudioKeyNotice, useOpenRouterKeyConfigured } from "@/components/studio/studio-key-notice";
import { StudioModelPicker } from "@/components/studio/studio-model-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { useStudioCatalog } from "@/hooks/use-studio-catalog";
import { useStudioItems } from "@/hooks/use-studio-items";
import { useSpeechModelOptions } from "@/hooks/use-studio-model-options";
import { retryStudioItem } from "@/lib/studio/actions";
import { supportsAudioTags } from "@/lib/studio/featured";
import {
  formatRelativeTime,
  formatStudioDuration,
  groupStudioItemsByDate,
  isStudioItemBusy,
  studioMediaUrl,
} from "@/lib/studio/format";
import {
  DEFAULT_STUDIO_PREFERENCES,
  loadStudioPreferences,
  saveStudioPreferences,
} from "@/lib/studio/preferences";
import { normalizeSearchText } from "@/lib/studio/search";
import { STUDIO_LIMITS, type StudioItem, type StudioSpeechModel } from "@/lib/studio/types";
import { cn } from "@/lib/utils";
import {
  AlertTriangleIcon,
  AudioLinesIcon,
  CheckIcon,
  ChevronDownIcon,
  DownloadIcon,
  GaugeIcon,
  MaximizeIcon,
  MicVocalIcon,
  PauseIcon,
  PencilLineIcon,
  PlayIcon,
  PlugIcon,
  RotateCcwIcon,
  SearchIcon,
  SquareIcon,
  Trash2Icon,
  WandIcon,
  XIcon,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

/** Rough Persian/English reading pace used for the duration hint. */
const CHARS_PER_SECOND = 14;
const SPEEDS = ["0.8", "0.9", "1", "1.1", "1.25"];

let activeAudio: HTMLAudioElement | null = null;

function VoicePicker({
  model,
  value,
  onValueChange,
}: {
  model: StudioSpeechModel | null;
  value: string;
  onValueChange: (voice: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [previewing, setPreviewing] = useState<string | null>(null);
  const previewRef = useRef<HTMLAudioElement | null>(null);
  const voices = useMemo(() => model?.voices ?? [], [model]);
  const selected = voices.find((voice) => voice.id === value);
  const filtered = useMemo(() => {
    const needle = normalizeSearchText(query);
    return needle
      ? voices.filter((voice) =>
          normalizeSearchText(`${voice.name} ${voice.id} ${voice.description ?? ""}`).includes(needle)
        )
      : voices;
  }, [voices, query]);

  function stopPreview() {
    previewRef.current?.pause();
    setPreviewing(null);
  }

  useEffect(() => () => previewRef.current?.pause(), []);

  function preview(url: string, id: string) {
    previewRef.current?.pause();
    if (previewing === id) {
      setPreviewing(null);
      return;
    }
    const audio = new Audio(url);
    previewRef.current = audio;
    audio.onended = () => setPreviewing(null);
    setPreviewing(id);
    void audio.play().catch(() => setPreviewing(null));
  }

  if (voices.length === 0) return null;

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setQuery("");
          stopPreview();
        }
      }}
    >
      <PopoverTrigger className={studioPillClass} aria-label="انتخاب صدا" title="صدا">
        <MicVocalIcon className="size-3.5 opacity-70" />
        <span className="max-w-28 truncate capitalize" dir="ltr">
          {selected?.name ?? "صدا"}
        </span>
        <ChevronDownIcon className="size-3.5 text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent side="top" align="end" className="w-72 gap-0 overflow-hidden rounded-2xl p-0" dir="rtl">
        {voices.length > 8 ? (
          <div className="relative border-b border-border/60 p-1.5">
            <SearchIcon className="pointer-events-none absolute inset-y-0 start-4 my-auto size-3.5 text-muted-foreground" />
            <Input
              type="search"
              value={query}
              autoComplete="off"
              placeholder="جستجوی صدا…"
              aria-label="جستجوی صدا"
              className="h-8 ps-8 text-xs md:text-xs"
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
        ) : null}
        <div className="flex max-h-72 flex-col overflow-y-auto p-1.5" role="listbox" aria-label="صداها">
          {filtered.map((voice) => {
            const isSelected = voice.id === value;
            return (
              <div
                key={voice.id}
                role="option"
                aria-selected={isSelected}
                className={cn("flex items-center rounded-lg transition-colors hover:bg-muted", isSelected && "bg-muted")}
              >
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center gap-2.5 px-2 py-1.5 text-start"
                  onClick={() => {
                    onValueChange(voice.id);
                    setOpen(false);
                  }}
                >
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-background text-[11px] font-medium uppercase ring-1 ring-border">
                    {voice.name.slice(0, 1)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-medium capitalize" dir="ltr">{voice.name}</span>
                    {voice.description ? (
                      <span className="block truncate text-[11px] text-muted-foreground">{voice.description}</span>
                    ) : null}
                  </span>
                  {isSelected ? <CheckIcon className="size-3.5 shrink-0" /> : null}
                </button>
                {voice.previewUrl ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    className="me-1 rounded-full"
                    aria-label={`پیش‌نمایش ${voice.name}`}
                    onClick={() => preview(voice.previewUrl!, voice.id)}
                  >
                    {previewing === voice.id ? <SquareIcon /> : <PlayIcon />}
                  </Button>
                ) : null}
              </div>
            );
          })}
          {filtered.length === 0 ? (
            <p className="py-6 text-center text-xs text-muted-foreground">صدایی پیدا نشد.</p>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}

const TONE_PRESETS = [
  "گرم و آرام",
  "شاد و پرانرژی",
  "رسمی و خبری",
  "مثل یک قصه‌گو",
  "آهسته و شمرده",
  "نجواگونه و صمیمی",
  "هیجان‌زده",
  "جدی و محکم",
];

/**
 * Tone/performance direction for models that accept it. A roomy popover
 * with presets instead of a cramped inline field; the text is sent as
 * direction, never read aloud.
 */
function TonePicker({ value, onValueChange }: { value: string; onValueChange: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const active = value.trim();

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className={cn(studioPillClass, "max-w-44", active && "bg-foreground/10 text-foreground")}
        title={active ? `لحن: ${active}` : "لحن و سبک خواندن"}
      >
        <WandIcon className="size-3.5 shrink-0 opacity-70" />
        <span className="truncate">{active || "لحن"}</span>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="end"
        initialFocus={textareaRef}
        className="w-[min(22rem,calc(100vw-2rem))] gap-3 rounded-2xl p-3"
        dir="rtl"
      >
        <div>
          <p className="text-sm font-medium">لحن و اجرا</p>
          <p className="mt-0.5 text-[11.5px] leading-5 text-muted-foreground">
            فقط راهنمای اجراست و خوانده نمی‌شود.
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {TONE_PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              className={cn(
                "rounded-full border px-2.5 py-1 text-xs transition-colors",
                active === preset
                  ? "border-foreground/30 bg-foreground/10 text-foreground"
                  : "border-border/70 text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
              onClick={() => onValueChange(active === preset ? "" : preset)}
            >
              {preset}
            </button>
          ))}
        </div>
        <Textarea
          ref={textareaRef}
          dir={active ? "auto" : "rtl"}
          value={value}
          rows={3}
          maxLength={1_000}
          placeholder="یا خودتان بنویسید؛ مثلاً: صمیمی و آرام، با کمی مکث بعد از هر جمله"
          aria-label="لحن و سبک خواندن"
          className="min-h-20 resize-none text-[13px] leading-6"
          onChange={(event) => onValueChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
              event.preventDefault();
              setOpen(false);
            }
          }}
        />
        <div className="flex items-center justify-between">
          <Button type="button" variant="ghost" size="sm" disabled={!active} onClick={() => onValueChange("")}>
            پاک کردن
          </Button>
          <Button type="button" size="sm" className="rounded-full px-4" onClick={() => setOpen(false)}>
            تمام
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** Compact history row with inline playback. */
function SpeechRow({ item, onReuse }: { item: StudioItem; onReuse: (item: StudioItem) => void }) {
  const { openItem } = useStudio();
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState<number | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);
  const busy = isStudioItemBusy(item);
  const failed = item.status === "failed" || item.status === "interrupted";
  const ready = item.status === "done" && item.hasMedia;
  const voice = typeof item.params.voice === "string" ? item.params.voice : null;

  useEffect(() => {
    const audio = audioRef.current;
    return () => {
      if (audio && activeAudio === audio) activeAudio = null;
    };
  }, []);

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

  async function retry() {
    setIsRetrying(true);
    try {
      await retryStudioItem(item);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تلاش دوباره ناموفق بود.");
    } finally {
      setIsRetrying(false);
    }
  }

  return (
    <article className="group/row relative flex items-start gap-3 rounded-xl px-2 py-2.5 transition-colors hover:bg-muted/50">
      {ready ? (
        <>
          <audio
            ref={audioRef}
            src={studioMediaUrl(item)}
            preload="metadata"
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            onEnded={() => {
              setIsPlaying(false);
              setProgress(0);
            }}
            onLoadedMetadata={(event) => {
              const value = event.currentTarget.duration;
              if (Number.isFinite(value)) setDuration(value);
            }}
            onTimeUpdate={(event) => {
              const audio = event.currentTarget;
              setProgress(audio.duration ? audio.currentTime / audio.duration : 0);
            }}
          />
          <Button
            type="button"
            size="icon-sm"
            variant={isPlaying ? "default" : "secondary"}
            className="mt-0.5 shrink-0 rounded-full"
            aria-label={isPlaying ? "توقف" : "پخش"}
            onClick={toggle}
          >
            {isPlaying ? <PauseIcon /> : <PlayIcon className="translate-x-px" />}
          </Button>
        </>
      ) : (
        <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-muted">
          {busy ? <Spinner className="size-3.5" /> : <AlertTriangleIcon className="size-3.5 text-destructive" />}
        </span>
      )}

      <div className="min-w-0 flex-1">
        <StudioExpandableText text={item.text ?? item.prompt}>
          <StudioAudioTagText text={item.text ?? item.prompt} />
        </StudioExpandableText>
        {failed ? (
          <p className="mt-0.5 line-clamp-1 text-[11px] text-destructive">{item.error ?? "ساخت صدا ناموفق بود."}</p>
        ) : (
          <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
            {voice ? <span className="capitalize" dir="ltr">{voice}</span> : null}
            {voice ? <span aria-hidden>·</span> : null}
            <span className="truncate" dir="ltr">{item.modelId.split("/").at(-1)}</span>
            <span aria-hidden>·</span>
            <time dateTime={new Date(item.createdAt).toISOString()}>
              {busy ? "در حال ساخت…" : formatRelativeTime(item.createdAt)}
            </time>
            {duration ? (
              <>
                <span aria-hidden>·</span>
                <span className="tabular-nums">{formatStudioDuration(duration)}</span>
              </>
            ) : null}
          </div>
        )}
        {ready && progress > 0 ? (
          <div className="mt-1.5 h-0.5 overflow-hidden rounded-full bg-foreground/10" dir="ltr">
            <div className="h-full bg-foreground/60 transition-[width]" style={{ width: `${progress * 100}%` }} />
          </div>
        ) : null}
      </div>

      <div className="flex shrink-0 items-center opacity-0 transition-opacity group-hover/row:opacity-100 group-focus-within/row:opacity-100">
        {failed ? (
          <Button type="button" variant="ghost" size="icon-sm" aria-label="تلاش دوباره" title="تلاش دوباره" disabled={isRetrying} onClick={() => void retry()}>
            {isRetrying ? <Spinner /> : <RotateCcwIcon />}
          </Button>
        ) : null}
        {busy ? (
          <Button type="button" variant="ghost" size="icon-sm" aria-label="لغو" title="لغو" onClick={() => void window.desktop.studio.cancel(item.id)}>
            <XIcon />
          </Button>
        ) : null}
        <Button type="button" variant="ghost" size="icon-sm" aria-label="استفاده دوباره از متن" title="استفاده دوباره" onClick={() => onReuse(item)}>
          <PencilLineIcon />
        </Button>
        {ready ? (
          <Button type="button" variant="ghost" size="icon-sm" aria-label="ذخیره فایل صوتی" title="ذخیره" onClick={() => void window.desktop.studio.saveAs(item.id)}>
            <DownloadIcon />
          </Button>
        ) : null}
        <Button type="button" variant="ghost" size="icon-sm" aria-label="جزئیات" title="جزئیات" onClick={() => openItem(item)}>
          <MaximizeIcon />
        </Button>
        <Button type="button" variant="ghost" size="icon-sm" aria-label="حذف" title="حذف" onClick={() => void window.desktop.studio.delete(item.id)}>
          <Trash2Icon />
        </Button>
      </div>
    </article>
  );
}

export function SpeechStudio() {
  const { draft, clearDraft, openConnections } = useStudio();
  const { catalog, isLoading, refresh } = useStudioCatalog();
  const openRouterReady = useOpenRouterKeyConfigured();
  const { items, isLoading: itemsLoading, hasMore, loadMore } = useStudioItems({ kind: "speech" });
  const preferences = useMemo(loadStudioPreferences, []);
  const [text, setText] = useState("");
  const [instructions, setInstructions] = useState("");
  const [modelKey, setModelKey] = useState(
    preferences.speechModelKey ?? DEFAULT_STUDIO_PREFERENCES.speechModelKey
  );
  const [voice, setVoice] = useState(preferences.speechVoice ?? "");
  const [speed, setSpeed] = useState(String(preferences.speechSpeed ?? 1));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const newestId = useRef<string | null>(null);

  const models = useMemo(() => catalog?.speech ?? [], [catalog]);
  const options = useSpeechModelOptions(models);
  const model = models.find((candidate) => studioModelKey(candidate.provider, candidate.id) === modelKey) ?? null;
  const needsOpenRouter = (model?.provider ?? parseStudioModelKey(modelKey).provider) === "openrouter";
  const canTag = Boolean(model && supportsAudioTags(model.id));

  useEffect(() => {
    if (models.length === 0 || model) return;
    const fallback = options.filter((option) => typeof option.rank === "number").sort((a, b) => a.rank! - b.rank!)[0] ?? options[0];
    if (fallback) setModelKey(fallback.key);
  }, [models, model, options]);

  useEffect(() => {
    if (!model || model.voices.length === 0) return;
    if (!model.voices.some((candidate) => candidate.id === voice)) setVoice(model.voices[0].id);
  }, [model, voice]);

  const textRef = useRef(text);
  textRef.current = text;
  const [flashSignal, setFlashSignal] = useState(0);

  // Text handed over from elsewhere (e.g. a transcript): fill, highlight, and
  // offer an undo if it replaced something the person had written.
  useEffect(() => {
    if (draft?.tab !== "speech") return;
    if (draft.text !== undefined) {
      const previous = textRef.current;
      const next = draft.text.slice(0, STUDIO_LIMITS.speechInput);
      setText(next);
      setFlashSignal((value) => value + 1);
      if (previous.trim() && previous !== next) {
        toast.info("متن جدید جایگزین متن قبلی شد.", {
          action: { label: "بازگشت", onClick: () => setText(previous) },
        });
      }
    }
    clearDraft();
  }, [draft, clearDraft]);

  useEffect(() => {
    const newest = items[0]?.id ?? null;
    if (newestId.current && newest && newest !== newestId.current) {
      scrollerRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    }
    newestId.current = newest;
  }, [items]);

  async function submit() {
    if (!model || !text.trim()) return;
    setIsSubmitting(true);
    try {
      await window.desktop.studio.generateSpeech({
        provider: model.provider,
        modelId: model.id,
        voice,
        input: text,
        instructions: model.supportsInstructions ? instructions : undefined,
        speed: model.supportsSpeed && Number(speed) !== 1 ? Number(speed) : undefined,
      });
      saveStudioPreferences({ speechModelKey: modelKey, speechVoice: voice, speechSpeed: Number(speed) });
      setText("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "شروع ساخت ناموفق بود.");
    } finally {
      setIsSubmitting(false);
    }
  }

  function reuse(item: StudioItem) {
    setText(item.text ?? item.prompt);
    setModelKey(studioModelKey(item.provider, item.modelId));
    if (typeof item.params.voice === "string") setVoice(item.params.voice);
    setInstructions(typeof item.params.instructions === "string" ? item.params.instructions : "");
  }

  const spoken = text.replace(/\[[^\]]*\]/g, "").trim();
  const seconds = Math.max(1, Math.round(spoken.length / CHARS_PER_SECOND));

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div ref={scrollerRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col px-4 py-5 sm:px-6">
          {itemsLoading && items.length === 0 ? (
            <div className="flex flex-col gap-2">
              {Array.from({ length: 4 }, (_, index) => (
                <Skeleton key={index} className="h-14 rounded-xl" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="my-auto">
              <StudioEmptyState
                icon={<AudioLinesIcon />}
                title="اولین صدایتان را بسازید"
                description="متن را بنویسید، صدا را انتخاب کنید و بسازید. برای فارسی، Gemini TTS و Eleven v3/v4 بهترند."
              />
            </div>
          ) : (
            <div className="flex flex-col gap-5">
              {groupStudioItemsByDate(items).map((group) => (
                <section key={group.label} className="flex flex-col">
                  <h2 className="mb-1 px-2 text-xs font-medium text-muted-foreground">{group.label}</h2>
                  {group.items.map((item) => (
                    <SpeechRow key={item.id} item={item} onReuse={reuse} />
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

      <div className="shrink-0 border-t border-border/60 bg-background px-4 pt-3 pb-3 sm:px-6">
        <StudioComposer
          value={text}
          onValueChange={setText}
          onSubmit={() => void submit()}
          placeholder={
            canTag
              ? "متنی که خوانده شود… برای حس بیشتر از برچسب‌هایی مثل [whispers] استفاده کنید"
              : "متنی که می‌خواهید خوانده شود را بنویسید یا بچسبانید…"
          }
          maxLength={STUDIO_LIMITS.speechInput}
          canSubmit={Boolean(text.trim() && model && (!needsOpenRouter || openRouterReady !== false))}
          isSubmitting={isSubmitting}
          submitLabel="ساخت صدا"
          submitOnEnter={false}
          tall
          flashSignal={flashSignal}
          highlightAudioTags={canTag || /\[[^\]\n]{1,40}\]/.test(text)}
          enhanceKind={canTag ? "speech-tags" : undefined}
          notice={needsOpenRouter && openRouterReady === false ? <StudioKeyNotice /> : null}
          footer={
            text.trim() ? (
              <span className="tabular-nums">
                {text.length.toLocaleString("fa-IR")} نویسه · حدود {seconds.toLocaleString("fa-IR")} ثانیه
              </span>
            ) : null
          }
          toolbar={
            <>
              <StudioModelPicker
                options={options}
                value={modelKey}
                onValueChange={setModelKey}
                isLoading={isLoading}
                onRefresh={() => void refresh()}
                footer={
                  <Button type="button" variant="ghost" size="sm" className="w-full justify-start" onClick={openConnections}>
                    <PlugIcon data-icon="inline-start" />
                    اتصال Google AI Studio یا ElevenLabs
                  </Button>
                }
              />
              <VoicePicker model={model} value={voice} onValueChange={setVoice} />
              {model?.supportsInstructions ? (
                <TonePicker value={instructions} onValueChange={setInstructions} />
              ) : null}
              {model?.supportsSpeed ? (
                <StudioOptionChip
                  label="سرعت"
                  value={speed}
                  onValueChange={setSpeed}
                  icon={<GaugeIcon className="size-3.5 opacity-70" />}
                  options={SPEEDS.map((value) => ({
                    value,
                    label: `${Number(value).toLocaleString("fa-IR")}×`,
                  }))}
                />
              ) : null}
            </>
          }
        />
      </div>
    </div>
  );
}
