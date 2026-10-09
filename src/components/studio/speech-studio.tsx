"use client";

import { useStudio } from "@/components/studio/studio-context";
import { StudioAudioPlayer } from "@/components/studio/studio-audio-player";
import { StudioEmptyHero } from "@/components/studio/studio-gallery";
import {
  StudioKeyNotice,
  useOpenRouterKeyConfigured,
} from "@/components/studio/studio-key-notice";
import {
  StudioModelPicker,
  type StudioModelOption,
} from "@/components/studio/studio-model-picker";
import {
  StudioOptionChip,
  StudioPromptBox,
  StudioShortcutHint,
} from "@/components/studio/studio-prompt-box";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { useStudioCatalog } from "@/hooks/use-studio-catalog";
import { useStudioItems } from "@/hooks/use-studio-items";
import { retryStudioItem } from "@/lib/studio/actions";
import {
  formatRelativeTime,
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
import {
  STUDIO_LIMITS,
  type StudioElevenLabsStatus,
  type StudioItem,
  type StudioSpeechModel,
} from "@/lib/studio/types";
import { cn } from "@/lib/utils";
import {
  AlertTriangleIcon,
  AudioLinesIcon,
  CheckIcon,
  ChevronDownIcon,
  DownloadIcon,
  GaugeIcon,
  KeyRoundIcon,
  MaximizeIcon,
  MicVocalIcon,
  PlayIcon,
  RotateCcwIcon,
  SearchIcon,
  SquareIcon,
  Trash2Icon,
  WandSparklesIcon,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

const SPEEDS = ["0.75", "1", "1.25", "1.5"];

const SUGGESTIONS = [
  "سلام! به نیمروز خوش آمدید. امروز چه کاری می‌توانم برایتان انجام دهم؟",
  "در یک صبح آرام پاییزی، بوی نان تازه در کوچه پیچیده بود.",
];

function modelKey(model: Pick<StudioSpeechModel, "provider" | "id">) {
  return `${model.provider}::${model.id}`;
}

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
  const voices = model?.voices ?? [];
  const selected = voices.find((voice) => voice.id === value);
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

  if (voices.length === 0) return null;

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setQuery("");
          previewRef.current?.pause();
          setPreviewing(null);
        }
      }}
    >
      <PopoverTrigger
        aria-label="انتخاب صدا"
        className="inline-flex h-8 max-w-48 items-center gap-1.5 rounded-full border border-border/70 bg-muted/60 px-2.5 text-xs font-medium transition-colors hover:bg-muted focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        <MicVocalIcon className="size-3.5 shrink-0 opacity-70" />
        <span className="truncate capitalize" dir="ltr">
          {selected?.name ?? "صدا"}
        </span>
        <ChevronDownIcon className="size-3.5 shrink-0 text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 gap-0 overflow-hidden rounded-2xl p-0">
        <div className="relative border-b border-border/60 p-1.5" dir="rtl">
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
        <ScrollArea className="h-64">
          <div className="flex flex-col p-1.5">
            {filtered.map((voice) => (
              <div
                key={voice.id}
                className={cn(
                  "flex items-center gap-1 rounded-xl transition-colors hover:bg-muted",
                  voice.id === value && "bg-muted"
                )}
              >
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center gap-2 px-2.5 py-1.5 text-start"
                  onClick={() => {
                    onValueChange(voice.id);
                    setOpen(false);
                  }}
                >
                  <span className="min-w-0 flex-1" dir="ltr">
                    <span className="block truncate text-xs font-medium capitalize">{voice.name}</span>
                    {voice.description ? (
                      <span className="block truncate text-[10px] text-muted-foreground">
                        {voice.description}
                      </span>
                    ) : null}
                  </span>
                  {voice.id === value ? <CheckIcon className="size-3.5 text-primary" /> : null}
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
            ))}
            {filtered.length === 0 ? (
              <p className="py-8 text-center text-xs text-muted-foreground">صدایی پیدا نشد.</p>
            ) : null}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}

function ElevenLabsKeyDialog({
  open,
  onOpenChange,
  status,
  onStatusChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  status: StudioElevenLabsStatus | null;
  onStatusChange: (status: StudioElevenLabsStatus) => void;
}) {
  const { refresh } = useStudioCatalog();
  const [key, setKey] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  async function save() {
    setIsSaving(true);
    try {
      onStatusChange(await window.desktop.studio.elevenLabs.setKey(key));
      setKey("");
      await refresh();
      toast.success("ElevenLabs متصل شد؛ صداهای حساب شما اضافه شدند.");
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "ذخیره کلید ناموفق بود.");
    } finally {
      setIsSaving(false);
    }
  }

  async function disconnect() {
    onStatusChange(await window.desktop.studio.elevenLabs.clearKey());
    await refresh();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl">
        <DialogHeader>
          <DialogTitle>اتصال مستقیم ElevenLabs</DialogTitle>
          <DialogDescription>
            مدل‌های ElevenLabs از طریق OpenRouter هم در دسترس‌اند. با کلید شخصی، صداهای
            ساخته‌شده و کلون‌شده حساب خودتان را هم خواهید داشت. کلید رمزگذاری‌شده روی همین دستگاه
            می‌ماند.
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (key.trim()) void save();
          }}
        >
          <Input
            type="password"
            dir="ltr"
            autoComplete="off"
            placeholder={status?.configured ? `ذخیره‌شده ${status.hint ?? ""}` : "sk_…"}
            value={key}
            aria-label="کلید API الون‌لبز"
            onChange={(event) => setKey(event.target.value)}
          />
        </form>
        <DialogFooter>
          {status?.configured ? (
            <Button type="button" variant="ghost" className="me-auto text-destructive" onClick={() => void disconnect()}>
              قطع اتصال
            </Button>
          ) : null}
          <Button type="button" disabled={!key.trim() || isSaving} onClick={() => void save()}>
            {isSaving ? <Spinner data-icon="inline-start" /> : null}
            ذخیره کلید
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SpeechClip({ item }: { item: StudioItem }) {
  const { openItem } = useStudio();
  const [isRetrying, setIsRetrying] = useState(false);
  const busy = isStudioItemBusy(item);
  const failed = item.status === "failed" || item.status === "interrupted";
  const voice = typeof item.params.voice === "string" ? item.params.voice : null;

  return (
    <article className="group/clip flex flex-col gap-3 rounded-3xl border border-border/60 bg-card p-4 shadow-xs transition-colors hover:border-border">
      <p dir="auto" className="line-clamp-3 text-sm leading-7 text-foreground/90">
        {item.text ?? item.prompt}
      </p>
      {item.status === "done" && item.hasMedia ? (
        <StudioAudioPlayer src={studioMediaUrl(item)} />
      ) : busy ? (
        <div className="studio-shimmer flex h-12 items-center gap-2 rounded-2xl px-4 text-xs text-muted-foreground">
          <Spinner className="size-4" />
          در حال ساخت صدا…
        </div>
      ) : failed ? (
        <div className="flex items-center gap-2 rounded-2xl bg-destructive/8 px-3 py-2.5 text-xs text-destructive">
          <AlertTriangleIcon className="size-4 shrink-0" />
          <span className="line-clamp-2 flex-1">{item.error ?? "ساخت صدا ناموفق بود."}</span>
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
        {voice ? (
          <span className="rounded-full bg-muted px-2 py-0.5 capitalize" dir="ltr">
            {voice}
          </span>
        ) : null}
        <span className="truncate" dir="ltr">{item.modelId.split("/").at(-1)}</span>
        <span aria-hidden>·</span>
        <time dateTime={new Date(item.createdAt).toISOString()}>{formatRelativeTime(item.createdAt)}</time>
        <div className="ms-auto flex items-center gap-0.5 opacity-60 transition-opacity group-hover/clip:opacity-100 group-focus-within/clip:opacity-100">
          {item.hasMedia ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="ذخیره فایل صوتی"
              onClick={() => void window.desktop.studio.saveAs(item.id)}
            >
              <DownloadIcon />
            </Button>
          ) : null}
          <Button type="button" variant="ghost" size="icon-sm" aria-label="جزئیات" onClick={() => openItem(item)}>
            <MaximizeIcon />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="حذف"
            onClick={() => void window.desktop.studio.delete(item.id)}
          >
            <Trash2Icon />
          </Button>
        </div>
      </div>
    </article>
  );
}

export function SpeechStudio() {
  const { draft, clearDraft } = useStudio();
  const { catalog, isLoading, refresh } = useStudioCatalog();
  const keyConfigured = useOpenRouterKeyConfigured();
  const { items, isLoading: itemsLoading, hasMore, loadMore } = useStudioItems({ kind: "speech" });
  const preferences = useMemo(loadStudioPreferences, []);
  const [text, setText] = useState("");
  const [instructions, setInstructions] = useState("");
  const [selectedKey, setSelectedKey] = useState(
    preferences.speechModelKey ?? DEFAULT_STUDIO_PREFERENCES.speechModelKey
  );
  const [voice, setVoice] = useState(preferences.speechVoice ?? "");
  const [speed, setSpeed] = useState(String(preferences.speechSpeed ?? 1));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [elevenStatus, setElevenStatus] = useState<StudioElevenLabsStatus | null>(null);
  const [elevenDialogOpen, setElevenDialogOpen] = useState(false);

  const models = catalog?.speech ?? [];
  const model = models.find((candidate) => modelKey(candidate) === selectedKey) ?? null;

  useEffect(() => {
    void window.desktop.studio.elevenLabs.getStatus().then(setElevenStatus).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (models.length > 0 && !model) setSelectedKey(modelKey(models[0]));
  }, [models, model]);

  useEffect(() => {
    if (!model) return;
    if (model.voices.length > 0 && !model.voices.some((candidate) => candidate.id === voice)) {
      setVoice(model.voices[0].id);
    }
  }, [model, voice]);

  useEffect(() => {
    if (draft?.tab !== "speech") return;
    if (draft.text !== undefined) setText(draft.text.slice(0, STUDIO_LIMITS.speechInput));
    clearDraft();
  }, [draft, clearDraft]);

  const options: StudioModelOption[] = useMemo(
    () =>
      models.map((candidate) => ({
        key: modelKey(candidate),
        id: candidate.id,
        name: candidate.name,
        group:
          candidate.provider === "elevenlabs"
            ? "ElevenLabs · کلید شخصی"
            : candidate.id.split("/")[0],
        meta:
          candidate.voices.length > 0
            ? `${candidate.voices.length.toLocaleString("fa-IR")} صدا`
            : "صدای پیش‌فرض",
        badge: candidate.supportsInstructions ? "لحن" : undefined,
      })),
    [models]
  );

  const needsOpenRouter = model?.provider !== "elevenlabs";

  async function submit() {
    if (!model) return;
    setIsSubmitting(true);
    try {
      await window.desktop.studio.generateSpeech({
        provider: model.provider,
        modelId: model.id,
        voice,
        input: text,
        instructions: model.supportsInstructions ? instructions : undefined,
        speed: Number(speed) === 1 ? undefined : Number(speed),
      });
      saveStudioPreferences({
        speechModelKey: modelKey(model),
        speechVoice: voice,
        speechSpeed: Number(speed),
      });
      setText("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "شروع ساخت ناموفق بود.");
    } finally {
      setIsSubmitting(false);
    }
  }

  const remaining = STUDIO_LIMITS.speechInput - text.length;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-6 sm:px-8">
      <div className="flex flex-col gap-3">
        {keyConfigured === false && needsOpenRouter ? <StudioKeyNotice /> : null}
        <StudioPromptBox
          value={text}
          onValueChange={setText}
          onSubmit={() => void submit()}
          placeholder="متنی که می‌خواهید خوانده شود را بنویسید…"
          maxLength={STUDIO_LIMITS.speechInput}
          minRows={4}
          canSubmit={Boolean(
            text.trim() && model && (!needsOpenRouter || keyConfigured !== false)
          )}
          isSubmitting={isSubmitting}
          submitLabel="ساخت صدا"
          hint={
            remaining < 500 ? (
              <span className={cn("tabular-nums", remaining < 100 && "text-destructive")}>
                {remaining.toLocaleString("fa-IR")} نویسه باقی‌مانده
              </span>
            ) : (
              <StudioShortcutHint />
            )
          }
          attachments={
            model?.supportsInstructions ? (
              <div className="flex items-center gap-2 rounded-2xl bg-muted/60 px-3 py-1.5">
                <WandSparklesIcon className="size-3.5 shrink-0 text-muted-foreground" />
                <input
                  dir="auto"
                  value={instructions}
                  maxLength={1_000}
                  placeholder="لحن و سبک خواندن (اختیاری) — مثلاً: گرم و آرام، مثل یک قصه‌گو"
                  aria-label="لحن و سبک خواندن"
                  className="h-7 w-full bg-transparent text-xs outline-none placeholder:text-muted-foreground/70"
                  onChange={(event) => setInstructions(event.target.value)}
                />
              </div>
            ) : null
          }
          toolbar={
            <>
              <StudioModelPicker
                options={options}
                value={selectedKey}
                onValueChange={setSelectedKey}
                isLoading={isLoading}
                onRefresh={() => void refresh()}
                footer={
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start"
                    onClick={() => setElevenDialogOpen(true)}
                  >
                    <KeyRoundIcon data-icon="inline-start" />
                    {elevenStatus?.configured
                      ? `ElevenLabs متصل است ${elevenStatus.hint ?? ""}`
                      : "اتصال ElevenLabs با کلید شخصی"}
                  </Button>
                }
              />
              <VoicePicker model={model} value={voice} onValueChange={setVoice} />
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
            </>
          }
        />
      </div>

      {itemsLoading && items.length === 0 ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-36 rounded-3xl" />
          <Skeleton className="h-36 rounded-3xl" />
        </div>
      ) : items.length === 0 ? (
        <StudioEmptyHero
          icon={<AudioLinesIcon />}
          title="متن را به صدای طبیعی تبدیل کنید"
          description="Gemini TTS، ElevenLabs و مدل‌های دیگر؛ برای فارسی مدل‌های چندزبانه مثل Gemini و Eleven v3 بهترند."
          suggestions={SUGGESTIONS}
          onSuggestion={setText}
        />
      ) : (
        <div className="flex flex-col gap-6">
          {groupStudioItemsByDate(items).map((group) => (
            <section key={group.label} className="flex flex-col gap-3">
              <h2 className="text-xs font-medium text-muted-foreground">{group.label}</h2>
              {group.items.map((item) => (
                <SpeechClip key={item.id} item={item} />
              ))}
            </section>
          ))}
          {hasMore ? (
            <Button type="button" variant="outline" className="self-center rounded-full" onClick={loadMore}>
              نمایش موارد قدیمی‌تر
            </Button>
          ) : null}
        </div>
      )}

      <ElevenLabsKeyDialog
        open={elevenDialogOpen}
        onOpenChange={setElevenDialogOpen}
        status={elevenStatus}
        onStatusChange={setElevenStatus}
      />
    </div>
  );
}
