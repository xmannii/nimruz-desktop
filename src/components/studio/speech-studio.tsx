"use client";

import { StudioAudioPlayer } from "@/components/studio/studio-audio-player";
import {
  parseStudioModelKey,
  studioModelKey,
  useStudio,
} from "@/components/studio/studio-context";
import { StudioKeyNotice, useOpenRouterKeyConfigured } from "@/components/studio/studio-key-notice";
import { StudioModelPicker } from "@/components/studio/studio-model-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Slider } from "@/components/ui/slider";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { useStudioCatalog } from "@/hooks/use-studio-catalog";
import { useStudioItems } from "@/hooks/use-studio-items";
import { useSpeechModelOptions } from "@/hooks/use-studio-model-options";
import { retryStudioItem } from "@/lib/studio/actions";
import { requestPromptEnhancement } from "@/lib/studio/enhance";
import { supportsAudioTags } from "@/lib/studio/featured";
import { useAppShell } from "@/components/app-shell-context";
import {
  formatRelativeTime,
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
  CheckIcon,
  DownloadIcon,
  MaximizeIcon,
  PlayIcon,
  PlugIcon,
  RotateCcwIcon,
  SearchIcon,
  SlidersHorizontalIcon,
  SparklesIcon,
  SquareIcon,
  Trash2Icon,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

/** Rough Persian/English reading pace used for the duration hint. */
const CHARS_PER_SECOND = 14;

function VoiceList({
  model,
  value,
  onValueChange,
}: {
  model: StudioSpeechModel | null;
  value: string;
  onValueChange: (voice: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [previewing, setPreviewing] = useState<string | null>(null);
  const previewRef = useRef<HTMLAudioElement | null>(null);
  const voices = useMemo(() => model?.voices ?? [], [model]);
  const filtered = useMemo(() => {
    const needle = normalizeSearchText(query);
    return needle
      ? voices.filter((voice) =>
          normalizeSearchText(`${voice.name} ${voice.id} ${voice.description ?? ""}`).includes(needle)
        )
      : voices;
  }, [voices, query]);

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

  if (voices.length === 0) {
    return <p className="text-xs text-muted-foreground">این مدل صدای پیش‌فرض خودش را دارد.</p>;
  }

  return (
    <div className="flex min-h-0 flex-col gap-2">
      {voices.length > 8 ? (
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute inset-y-0 start-2.5 my-auto size-3.5 text-muted-foreground" />
          <Input
            type="search"
            value={query}
            placeholder="جستجوی صدا…"
            aria-label="جستجوی صدا"
            className="h-8 ps-8 text-xs md:text-xs"
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
      ) : null}
      <div className="flex max-h-72 flex-col overflow-y-auto rounded-xl border border-border/70 p-1" role="listbox" aria-label="صداها">
        {filtered.map((voice) => {
          const selected = voice.id === value;
          return (
            <div
              key={voice.id}
              role="option"
              aria-selected={selected}
              className={cn("flex items-center rounded-lg transition-colors hover:bg-muted", selected && "bg-muted")}
            >
              <button
                type="button"
                className="flex min-w-0 flex-1 items-center gap-2.5 px-2 py-1.5 text-start"
                onClick={() => onValueChange(voice.id)}
              >
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-background text-[11px] font-medium uppercase ring-1 ring-border">
                  {voice.name.slice(0, 1)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-medium capitalize" dir="ltr">
                    {voice.name}
                  </span>
                  {voice.description ? (
                    <span className="block truncate text-[11px] text-muted-foreground">{voice.description}</span>
                  ) : null}
                </span>
                {selected ? <CheckIcon className="size-3.5 shrink-0" /> : null}
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
    </div>
  );
}

function SpeechClip({ item }: { item: StudioItem }) {
  const { openItem } = useStudio();
  const [isRetrying, setIsRetrying] = useState(false);
  const busy = isStudioItemBusy(item);
  const failed = item.status === "failed" || item.status === "interrupted";
  const voice = typeof item.params.voice === "string" ? item.params.voice : null;

  return (
    <article className="group/clip flex flex-col gap-2.5 border-b border-border/60 py-4 last:border-b-0">
      <p dir="auto" className="line-clamp-2 text-sm leading-7 text-foreground/90">
        {item.text ?? item.prompt}
      </p>
      {item.status === "done" && item.hasMedia ? (
        <StudioAudioPlayer src={studioMediaUrl(item)} />
      ) : busy ? (
        <div className="flex h-12 items-center gap-2 rounded-2xl bg-muted/70 px-4 text-xs text-muted-foreground">
          <Spinner className="size-4" />
          در حال ساخت صدا…
        </div>
      ) : failed ? (
        <div className="flex items-center gap-2 rounded-2xl bg-muted/70 px-3 py-2 text-xs">
          <AlertTriangleIcon className="size-4 shrink-0 text-destructive" />
          <span className="line-clamp-2 flex-1 text-muted-foreground">{item.error ?? "ساخت صدا ناموفق بود."}</span>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={isRetrying}
            onClick={async () => {
              setIsRetrying(true);
              try {
                await retryStudioItem(item);
              } catch (error) {
                toast.error(error instanceof Error ? error.message : "تلاش دوباره ناموفق بود.");
              } finally {
                setIsRetrying(false);
              }
            }}
          >
            {isRetrying ? <Spinner data-icon="inline-start" /> : <RotateCcwIcon data-icon="inline-start" />}
            دوباره
          </Button>
        </div>
      ) : null}
      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
        {voice ? <span className="capitalize" dir="ltr">{voice}</span> : null}
        {voice ? <span aria-hidden>·</span> : null}
        <span className="truncate" dir="ltr">{item.modelId.split("/").at(-1)}</span>
        <span aria-hidden>·</span>
        <time dateTime={new Date(item.createdAt).toISOString()}>{formatRelativeTime(item.createdAt)}</time>
        <div className="ms-auto flex items-center opacity-0 transition-opacity group-hover/clip:opacity-100 group-focus-within/clip:opacity-100">
          {item.hasMedia ? (
            <Button type="button" variant="ghost" size="icon-sm" aria-label="ذخیره فایل صوتی" onClick={() => void window.desktop.studio.saveAs(item.id)}>
              <DownloadIcon />
            </Button>
          ) : null}
          <Button type="button" variant="ghost" size="icon-sm" aria-label="جزئیات" onClick={() => openItem(item)}>
            <MaximizeIcon />
          </Button>
          <Button type="button" variant="ghost" size="icon-sm" aria-label="حذف" onClick={() => void window.desktop.studio.delete(item.id)}>
            <Trash2Icon />
          </Button>
        </div>
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
  const [speed, setSpeed] = useState(preferences.speechSpeed ?? 1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [isTagging, setIsTagging] = useState(false);
  const { defaultModelRef } = useAppShell();

  const models = useMemo(() => catalog?.speech ?? [], [catalog]);
  const options = useSpeechModelOptions(models);
  const model = models.find((candidate) => studioModelKey(candidate.provider, candidate.id) === modelKey) ?? null;
  const needsOpenRouter = (model?.provider ?? parseStudioModelKey(modelKey).provider) === "openrouter";

  useEffect(() => {
    if (models.length === 0 || model) return;
    const fallback = options.filter((option) => typeof option.rank === "number").sort((a, b) => a.rank! - b.rank!)[0] ?? options[0];
    if (fallback) setModelKey(fallback.key);
  }, [models, model, options]);

  useEffect(() => {
    if (!model || model.voices.length === 0) return;
    if (!model.voices.some((candidate) => candidate.id === voice)) setVoice(model.voices[0].id);
  }, [model, voice]);

  useEffect(() => {
    if (draft?.tab !== "speech") return;
    if (draft.text !== undefined) setText(draft.text.slice(0, STUDIO_LIMITS.speechInput));
    clearDraft();
  }, [draft, clearDraft]);

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
        speed: model.supportsSpeed && speed !== 1 ? speed : undefined,
      });
      saveStudioPreferences({ speechModelKey: modelKey, speechVoice: voice, speechSpeed: speed });
      setText("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "شروع ساخت ناموفق بود.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function addAudioTags() {
    if (!defaultModelRef || !text.trim()) return;
    const original = text;
    setIsTagging(true);
    try {
      const tagged = await requestPromptEnhancement({
        kind: "speech-tags",
        prompt: original,
        model: defaultModelRef,
      });
      setText(tagged);
      toast.success("برچسب‌های احساس اضافه شد.", {
        action: { label: "بازگشت", onClick: () => setText(original) },
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "افزودن برچسب‌ها ناموفق بود.");
    } finally {
      setIsTagging(false);
    }
  }

  const canTag = Boolean(model && supportsAudioTags(model.id));
  const seconds = Math.max(
    1,
    Math.round(text.replace(/\[[^\]]*\]/g, "").trim().length / CHARS_PER_SECOND)
  );
  const selectedVoice = model?.voices.find((candidate) => candidate.id === voice);
  const canSubmit = Boolean(text.trim() && model && (!needsOpenRouter || openRouterReady !== false));

  const settings = (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-2">
        <h3 className="text-xs font-medium text-muted-foreground">مدل</h3>
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
      </section>
      <section className="flex min-h-0 flex-col gap-2">
        <h3 className="text-xs font-medium text-muted-foreground">صدا</h3>
        <VoiceList model={model} value={voice} onValueChange={setVoice} />
      </section>
      {model?.supportsInstructions ? (
        <section className="flex flex-col gap-2">
          <h3 className="text-xs font-medium text-muted-foreground">لحن و سبک خواندن</h3>
          <Textarea
            dir={instructions.trim() ? "auto" : "rtl"}
            value={instructions}
            rows={3}
            maxLength={1_000}
            placeholder="مثلاً: گرم و آرام، مثل یک قصه‌گو"
            className="resize-none text-xs leading-6"
            onChange={(event) => setInstructions(event.target.value)}
          />
        </section>
      ) : null}
      {model?.supportsSpeed ? (
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-medium text-muted-foreground">سرعت</h3>
            <span className="text-xs tabular-nums">{speed.toLocaleString("fa-IR")}×</span>
          </div>
          <Slider
            dir="ltr"
            min={0.7}
            max={1.3}
            step={0.05}
            value={[speed]}
            onValueChange={(value) => setSpeed(Array.isArray(value) ? value[0] : value)}
            aria-label="سرعت خواندن"
          />
        </section>
      ) : null}
    </div>
  );

  return (
    <div className="flex h-full min-h-0">
      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-8 sm:px-8">
          {needsOpenRouter && openRouterReady === false ? <StudioKeyNotice /> : null}

          <div className="flex flex-col rounded-3xl border border-border bg-card shadow-xs transition-colors focus-within:border-foreground/25">
            <textarea
              dir={text.trim() ? "auto" : "rtl"}
              value={text}
              maxLength={STUDIO_LIMITS.speechInput}
              readOnly={isTagging}
              placeholder={
                canTag
                  ? "متن را بنویسید. برای حس بیشتر از برچسب‌هایی مثل [whispers] یا [laughs] استفاده کنید…"
                  : "متنی که می‌خواهید خوانده شود را اینجا بنویسید یا بچسبانید…"
              }
              aria-label="متن برای خواندن"
              className="min-h-56 w-full resize-none bg-transparent p-5 text-[17px] leading-9 outline-none placeholder:text-start placeholder:text-muted-foreground/60"
              onChange={(event) => setText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                  event.preventDefault();
                  if (canSubmit && !isSubmitting) void submit();
                }
              }}
            />
            <div className="flex items-center gap-3 border-t border-border/60 px-3 py-2.5">
              <Button
                type="button"
                className="rounded-full px-4"
                disabled={!canSubmit || isSubmitting}
                onClick={() => void submit()}
                title="Ctrl/⌘ + Enter"
              >
                {isSubmitting ? <Spinner data-icon="inline-start" /> : <PlayIcon data-icon="inline-start" />}
                ساخت صدا
              </Button>
              {canTag ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="rounded-full text-muted-foreground hover:text-foreground"
                  disabled={!text.trim() || !defaultModelRef || isTagging}
                  title={
                    defaultModelRef
                      ? "هوش مصنوعی برچسب‌هایی مثل [whispers] و [laughs] را به متن اضافه می‌کند؛ کلمات تغییر نمی‌کنند."
                      : "برای این کار یک مدل گفتگو فعال کنید"
                  }
                  onClick={() => void addAudioTags()}
                >
                  {isTagging ? <Spinner data-icon="inline-start" /> : <SparklesIcon data-icon="inline-start" />}
                  افزودن حس
                </Button>
              ) : null}
              <button
                type="button"
                className="flex min-w-0 items-center gap-1.5 rounded-full px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground lg:pointer-events-none"
                onClick={() => setSettingsOpen(true)}
              >
                <SlidersHorizontalIcon className="size-3.5 shrink-0 lg:hidden" />
                <span className="truncate capitalize" dir="ltr">
                  {selectedVoice?.name ?? "—"}
                </span>
              </button>
              <span className="ms-auto text-[11px] tabular-nums text-muted-foreground">
                {text.length.toLocaleString("fa-IR")} نویسه
                {text.trim() ? ` · حدود ${seconds.toLocaleString("fa-IR")} ثانیه` : ""}
              </span>
            </div>
          </div>

          <section aria-label="صداهای ساخته‌شده" className="flex flex-col">
            {itemsLoading && items.length === 0 ? (
              <div className="flex flex-col gap-3">
                <Skeleton className="h-24 rounded-2xl" />
                <Skeleton className="h-24 rounded-2xl" />
              </div>
            ) : items.length === 0 ? (
              <p className="py-8 text-center text-[13px] text-muted-foreground">
                صداهایی که می‌سازید اینجا نگه داشته می‌شوند.
              </p>
            ) : (
              <>
                <h2 className="mb-1 text-xs font-medium text-muted-foreground">ساخته‌های اخیر</h2>
                {items.map((item) => (
                  <SpeechClip key={item.id} item={item} />
                ))}
                {hasMore ? (
                  <Button type="button" variant="ghost" size="sm" className="mt-2 self-center rounded-full" onClick={loadMore}>
                    موارد قدیمی‌تر
                  </Button>
                ) : null}
              </>
            )}
          </section>
        </div>
      </div>

      <aside className="hidden w-80 shrink-0 overflow-y-auto border-s border-border/60 p-5 lg:block" aria-label="تنظیمات صدا">
        {settings}
      </aside>

      <Sheet open={settingsOpen} onOpenChange={setSettingsOpen}>
        <SheetContent side="left" className="w-full gap-0 overflow-y-auto sm:max-w-sm" dir="rtl">
          <SheetHeader className="border-b border-border/60 p-5">
            <SheetTitle>تنظیمات صدا</SheetTitle>
          </SheetHeader>
          <div className="p-5">{settings}</div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
