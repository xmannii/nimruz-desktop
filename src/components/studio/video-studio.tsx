"use client";

import {
  parseStudioModelKey,
  studioModelKey,
  useStudio,
} from "@/components/studio/studio-context";
import {
  StudioAttachmentThumb,
  StudioComposer,
} from "@/components/studio/studio-composer";
import {
  AspectRatioPicker,
  PresetPicker,
  StudioOptionChip,
  studioPillClass,
} from "@/components/studio/studio-controls";
import { StudioEmptyState, StudioFeed } from "@/components/studio/studio-feed";
import { StudioKeyNotice, useOpenRouterKeyConfigured } from "@/components/studio/studio-key-notice";
import { StudioModelPicker } from "@/components/studio/studio-model-picker";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { useStudioCatalog } from "@/hooks/use-studio-catalog";
import { useVideoModelOptions } from "@/hooks/use-studio-model-options";
import { readFileAsDataUrl } from "@/lib/studio/actions";
import { formatStudioCost, studioMediaUrl } from "@/lib/studio/format";
import {
  DEFAULT_STUDIO_PREFERENCES,
  loadStudioPreferences,
  saveStudioPreferences,
} from "@/lib/studio/preferences";
import { findPreset, VIDEO_CAMERA_MOVES } from "@/lib/studio/presets";
import { STUDIO_LIMITS, type StudioItem } from "@/lib/studio/types";
import { cn } from "@/lib/utils";
import {
  ClockIcon,
  FilmIcon,
  ImageUpIcon,
  MonitorIcon,
  MoveIcon,
  PlugIcon,
  Volume2Icon,
  VolumeXIcon,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

const CONFIRM_COST_USD = 1;

type FirstFrame = { type: "item"; item: StudioItem } | { type: "data-url"; dataUrl: string };

function pick<T>(values: T[], preferred: T | undefined, fallback?: T): T | undefined {
  if (preferred !== undefined && values.includes(preferred)) return preferred;
  if (fallback !== undefined && values.includes(fallback)) return fallback;
  return values[0];
}

export function VideoStudio() {
  const { draft, clearDraft, openConnections } = useStudio();
  const { catalog, isLoading, refresh } = useStudioCatalog();
  const openRouterReady = useOpenRouterKeyConfigured();
  const preferences = useMemo(loadStudioPreferences, []);
  const [prompt, setPrompt] = useState("");
  const [modelKey, setModelKey] = useState(
    preferences.videoModelKey ?? DEFAULT_STUDIO_PREFERENCES.videoModelKey
  );
  const [aspectRatio, setAspectRatio] = useState(preferences.videoAspectRatio);
  const [resolution, setResolution] = useState(preferences.videoResolution);
  const [duration, setDuration] = useState(preferences.videoDuration);
  const [withAudio, setWithAudio] = useState(preferences.videoAudio ?? true);
  const [camera, setCamera] = useState(preferences.videoCamera ?? "none");
  const [firstFrame, setFirstFrame] = useState<FirstFrame | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const models = useMemo(() => catalog?.video ?? [], [catalog]);
  const options = useVideoModelOptions(models);
  const model = models.find((candidate) => studioModelKey(candidate.provider, candidate.id) === modelKey) ?? null;
  const needsOpenRouter = (model?.provider ?? parseStudioModelKey(modelKey).provider) === "openrouter";

  useEffect(() => {
    if (models.length === 0 || model) return;
    const fallback = options.filter((option) => typeof option.rank === "number").sort((a, b) => a.rank! - b.rank!)[0] ?? options[0];
    if (fallback) setModelKey(fallback.key);
  }, [models, model, options]);

  // Keep options valid for whichever model is selected.
  const effectiveAspect = model ? pick(model.aspectRatios, aspectRatio, "16:9") : aspectRatio;
  const effectiveResolution = model ? pick(model.resolutions, resolution, "720p") : resolution;
  const effectiveDuration = model ? pick(model.durations, duration, 5) : duration;
  const estimate =
    model?.minPricePerSecond && effectiveDuration ? model.minPricePerSecond * effectiveDuration : null;

  useEffect(() => {
    if (draft?.tab !== "video") return;
    if (draft.prompt !== undefined) setPrompt(draft.prompt);
    if (draft.modelKey) setModelKey(draft.modelKey);
    if (draft.styleId) setCamera(draft.styleId);
    if (draft.firstFrameItem) {
      setFirstFrame({ type: "item", item: draft.firstFrameItem });
      if (!draft.prompt) setPrompt((current) => current || draft.firstFrameItem!.prompt);
    }
    clearDraft();
  }, [draft, clearDraft]);

  async function chooseFrame(file: File | undefined) {
    if (!file || !file.type.startsWith("image/")) return;
    if (file.size > STUDIO_LIMITS.maxReferenceImageBytes) {
      toast.error("تصویر باید کمتر از ۸ مگابایت باشد.");
      return;
    }
    try {
      setFirstFrame({ type: "data-url", dataUrl: await readFileAsDataUrl(file) });
    } catch {
      toast.error("خواندن تصویر ناموفق بود.");
    }
  }

  async function generate() {
    const { provider, modelId } = parseStudioModelKey(modelKey);
    const move = findPreset(VIDEO_CAMERA_MOVES, camera);
    setConfirmOpen(false);
    setIsSubmitting(true);
    try {
      await window.desktop.studio.generateVideo({
        provider: provider === "google" ? "google" : "openrouter",
        modelId,
        prompt,
        style: move.prompt ? { id: move.id, prompt: move.prompt } : undefined,
        aspectRatio: effectiveAspect,
        resolution: effectiveResolution,
        duration: effectiveDuration,
        generateAudio: model?.supportsAudio ? withAudio : undefined,
        firstFrame:
          firstFrame && model?.supportsFirstFrame
            ? firstFrame.type === "item"
              ? { type: "item", itemId: firstFrame.item.id }
              : { type: "data-url", dataUrl: firstFrame.dataUrl }
            : undefined,
      });
      saveStudioPreferences({
        videoModelKey: modelKey,
        videoAspectRatio: effectiveAspect,
        videoResolution: effectiveResolution,
        videoDuration: effectiveDuration,
        videoAudio: withAudio,
        videoCamera: camera,
      });
      setPrompt("");
      setFirstFrame(null);
      toast.success("ساخت ویدیو شروع شد. وقتی آماده شد خبرتان می‌کنیم.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "شروع ساخت ناموفق بود.");
    } finally {
      setIsSubmitting(false);
    }
  }

  function submit() {
    if (estimate !== null && estimate >= CONFIRM_COST_USD) setConfirmOpen(true);
    else void generate();
  }

  const frameSrc = firstFrame
    ? firstFrame.type === "item"
      ? studioMediaUrl(firstFrame.item)
      : firstFrame.dataUrl
    : null;

  const composer = (
    <StudioComposer
      value={prompt}
      onValueChange={setPrompt}
      onSubmit={submit}
      placeholder="صحنه، حرکت و حال‌وهوای ویدیو را توصیف کنید…"
      maxLength={STUDIO_LIMITS.prompt}
      canSubmit={Boolean(prompt.trim() && model && (!needsOpenRouter || openRouterReady !== false))}
      isSubmitting={isSubmitting}
      submitLabel="ساخت ویدیو"
      enhanceKind="video"
      onPasteImages={(files) => void chooseFrame(files[0])}
      notice={needsOpenRouter && openRouterReady === false ? <StudioKeyNotice /> : null}
      footer={
        estimate !== null ? (
          <span>
            هزینه تقریبی <span className="font-medium text-foreground/80">{formatStudioCost(estimate)}</span>
          </span>
        ) : model?.provider === "google" ? (
          "هزینه بر اساس تعرفه Google AI Studio"
        ) : null
      }
      attachments={
        frameSrc ? (
          <div className="flex items-center gap-3">
            <StudioAttachmentThumb src={frameSrc} label="فریم آغازین" wide muted={!model?.supportsFirstFrame} onRemove={() => setFirstFrame(null)} />
            <p className="text-[11px] leading-5 text-muted-foreground">
              {model?.supportsFirstFrame
                ? "ویدیو از این تصویر شروع می‌شود؛ بگویید چه حرکتی رخ دهد."
                : "این مدل فریم آغازین نمی‌پذیرد."}
            </p>
          </div>
        ) : null
      }
      toolbar={
        <>
          <button
            type="button"
            className={cn(studioPillClass, "px-2")}
            aria-label="فریم آغازین"
            title={model && !model.supportsFirstFrame ? "این مدل فریم آغازین نمی‌پذیرد" : "تصویر به ویدیو: فریم آغازین"}
            disabled={model ? !model.supportsFirstFrame : false}
            onClick={() => fileInputRef.current?.click()}
          >
            <ImageUpIcon className="size-4" />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="sr-only"
            onChange={(event) => {
              void chooseFrame(event.target.files?.[0]);
              event.target.value = "";
            }}
          />
          <StudioModelPicker
            options={options}
            value={modelKey}
            onValueChange={setModelKey}
            isLoading={isLoading}
            onRefresh={() => void refresh()}
            footer={
              <Button type="button" variant="ghost" size="sm" className="w-full justify-start" onClick={openConnections}>
                <PlugIcon data-icon="inline-start" />
                اتصال Google AI Studio برای Veo
              </Button>
            }
          />
          <PresetPicker
            presets={VIDEO_CAMERA_MOVES}
            value={camera}
            onValueChange={setCamera}
            label="حرکت دوربین"
            icon={<MoveIcon className="size-3.5" />}
          />
          {model && model.aspectRatios.length > 0 && effectiveAspect ? (
            <AspectRatioPicker value={effectiveAspect} onValueChange={setAspectRatio} ratios={model.aspectRatios} />
          ) : null}
          {model && effectiveDuration ? (
            <StudioOptionChip
              label="مدت"
              value={String(effectiveDuration)}
              onValueChange={(value) => setDuration(Number(value))}
              icon={<ClockIcon className="size-3.5 opacity-70" />}
              renderValue={(option) => `${Number(option?.value ?? 0).toLocaleString("fa-IR")}ث`}
              options={model.durations.map((seconds) => ({
                value: String(seconds),
                label: `${seconds.toLocaleString("fa-IR")} ثانیه`,
                detail: model.minPricePerSecond ? formatStudioCost(model.minPricePerSecond * seconds) ?? undefined : undefined,
              }))}
            />
          ) : null}
          {model && model.resolutions.length > 1 && effectiveResolution ? (
            <StudioOptionChip
              label="کیفیت"
              value={effectiveResolution}
              onValueChange={setResolution}
              icon={<MonitorIcon className="size-3.5 opacity-70" />}
              options={model.resolutions.map((value) => ({ value, label: value }))}
            />
          ) : null}
          {model?.supportsAudio ? (
            <button
              type="button"
              className={cn(studioPillClass, withAudio && "bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary")}
              aria-pressed={withAudio}
              onClick={() => setWithAudio((value) => !value)}
            >
              {withAudio ? <Volume2Icon className="size-3.5" /> : <VolumeXIcon className="size-3.5" />}
              {withAudio ? "با صدا" : "بی‌صدا"}
            </button>
          ) : null}
        </>
      }
    />
  );

  return (
    <>
      <StudioFeed
        kind="video"
        composer={composer}
          onDropFiles={(files) => void chooseFrame(files[0])}
        empty={
          <StudioEmptyState
            icon={<FilmIcon />}
            title="اولین ویدیویتان را بسازید"
            description="صحنه را توصیف کنید یا تصویری بدهید تا از آن شروع شود."
          />
        }
      />
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>این ویدیو حدود {formatStudioCost(estimate)} هزینه دارد</AlertDialogTitle>
            <AlertDialogDescription>
              مبلغ از اعتبار OpenRouter کسر می‌شود. هزینه نهایی پس از ساخت در جزئیات ویدیو نمایش داده می‌شود.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>انصراف</AlertDialogCancel>
            <AlertDialogAction onClick={() => void generate()}>ساخت ویدیو</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
