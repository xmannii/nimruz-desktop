"use client";

import { useStudio } from "@/components/studio/studio-context";
import { StudioEmptyHero, StudioGallery } from "@/components/studio/studio-gallery";
import {
  StudioKeyNotice,
  useOpenRouterKeyConfigured,
} from "@/components/studio/studio-key-notice";
import {
  StudioModelPicker,
  type StudioModelOption,
} from "@/components/studio/studio-model-picker";
import {
  AspectRatioGlyph,
  StudioOptionChip,
  StudioPromptBox,
} from "@/components/studio/studio-prompt-box";
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
import { Toggle } from "@/components/ui/toggle";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useStudioCatalog } from "@/hooks/use-studio-catalog";
import { readFileAsDataUrl } from "@/lib/studio/actions";
import { formatStudioCost, studioMediaUrl } from "@/lib/studio/format";
import {
  DEFAULT_STUDIO_PREFERENCES,
  loadStudioPreferences,
  saveStudioPreferences,
} from "@/lib/studio/preferences";
import { STUDIO_LIMITS, type StudioItem } from "@/lib/studio/types";
import {
  ClockIcon,
  FilmIcon,
  ImageUpIcon,
  MonitorIcon,
  Volume2Icon,
  VolumeXIcon,
  XIcon,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

const CONFIRM_COST_USD = 1;

const SUGGESTIONS = [
  "نمای هوایی آرام از کوه دماوند در طلوع، ابرها در حرکت",
  "قطره باران روی شیشه کافه، دوربین آهسته به جلو",
  "A paper boat drifting down a rainy street, cinematic, shallow depth of field",
];

type FirstFrame =
  | { type: "item"; item: StudioItem }
  | { type: "data-url"; dataUrl: string };

function pick<T>(values: T[], preferred: T | undefined, fallback?: T): T | undefined {
  if (preferred !== undefined && values.includes(preferred)) return preferred;
  if (fallback !== undefined && values.includes(fallback)) return fallback;
  return values[0];
}

export function VideoStudio() {
  const { draft, clearDraft } = useStudio();
  const { catalog, isLoading, refresh } = useStudioCatalog();
  const keyConfigured = useOpenRouterKeyConfigured();
  const preferences = useMemo(loadStudioPreferences, []);
  const [prompt, setPrompt] = useState("");
  const [modelId, setModelId] = useState(
    preferences.videoModelId ?? DEFAULT_STUDIO_PREFERENCES.videoModelId
  );
  const [aspectRatio, setAspectRatio] = useState(preferences.videoAspectRatio);
  const [resolution, setResolution] = useState(preferences.videoResolution);
  const [duration, setDuration] = useState(preferences.videoDuration);
  const [withAudio, setWithAudio] = useState(preferences.videoAudio ?? true);
  const [firstFrame, setFirstFrame] = useState<FirstFrame | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const models = catalog?.video ?? [];
  const model = models.find((candidate) => candidate.id === modelId) ?? null;

  useEffect(() => {
    if (models.length > 0 && !model) setModelId(models[0].id);
  }, [models, model]);

  // Keep options valid for whichever model is selected.
  const effectiveAspect = model ? pick(model.aspectRatios, aspectRatio, "16:9") : aspectRatio;
  const effectiveResolution = model ? pick(model.resolutions, resolution, "720p") : resolution;
  const effectiveDuration = model ? pick(model.durations, duration, 5) : duration;
  const estimate =
    model?.minPricePerSecond && effectiveDuration
      ? model.minPricePerSecond * effectiveDuration
      : null;

  useEffect(() => {
    if (draft?.tab !== "video") return;
    if (draft.prompt !== undefined) setPrompt(draft.prompt);
    if (draft.modelId) setModelId(draft.modelId);
    if (draft.firstFrameItem) setFirstFrame({ type: "item", item: draft.firstFrameItem });
    clearDraft();
  }, [draft, clearDraft]);

  const options: StudioModelOption[] = useMemo(
    () =>
      models.map((candidate) => ({
        key: candidate.id,
        id: candidate.id,
        name: candidate.name,
        badge: candidate.supportsAudio ? "صدا" : undefined,
        meta: [
          `${candidate.durations[0]}–${candidate.durations.at(-1)}s`,
          candidate.resolutions.join(" · "),
          candidate.minPricePerSecond
            ? `از ${formatStudioCost(candidate.minPricePerSecond)}/ثانیه`
            : null,
        ]
          .filter(Boolean)
          .join("  ·  "),
      })),
    [models]
  );

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
    setConfirmOpen(false);
    setIsSubmitting(true);
    try {
      await window.desktop.studio.generateVideo({
        modelId,
        prompt,
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
        videoModelId: modelId,
        videoAspectRatio: effectiveAspect,
        videoResolution: effectiveResolution,
        videoDuration: effectiveDuration,
        videoAudio: withAudio,
      });
      setPrompt("");
      setFirstFrame(null);
      toast.success("ساخت ویدیو شروع شد؛ چند دقیقه طول می‌کشد.");
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

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-6 sm:px-8">
      <div className="flex flex-col gap-3">
        {keyConfigured === false ? <StudioKeyNotice /> : null}
        <StudioPromptBox
          value={prompt}
          onValueChange={setPrompt}
          onSubmit={submit}
          placeholder="صحنه، حرکت دوربین و حال‌وهوای ویدیو را توصیف کنید…"
          maxLength={STUDIO_LIMITS.prompt}
          canSubmit={Boolean(prompt.trim() && model && keyConfigured !== false)}
          isSubmitting={isSubmitting}
          submitLabel="ساخت ویدیو"
          onPasteImages={(files) => void chooseFrame(files[0])}
          hint={estimate !== null ? `حدود ${formatStudioCost(estimate)}` : undefined}
          attachments={
            frameSrc ? (
              <div className="flex items-center gap-3">
                <div className="group/frame relative h-16 overflow-hidden rounded-xl ring-1 ring-foreground/10">
                  <img src={frameSrc} alt="فریم آغازین" className="h-full w-auto object-cover" />
                  <button
                    type="button"
                    aria-label="حذف فریم آغازین"
                    className="absolute end-1 top-1 flex size-5 items-center justify-center rounded-full bg-black/60 text-white"
                    onClick={() => setFirstFrame(null)}
                  >
                    <XIcon className="size-3" />
                  </button>
                </div>
                <p className="text-xs text-muted-foreground">
                  {model?.supportsFirstFrame
                    ? "ویدیو از این تصویر شروع می‌شود."
                    : "این مدل فریم آغازین نمی‌پذیرد؛ نادیده گرفته می‌شود."}
                </p>
              </div>
            ) : null
          }
          toolbar={
            <>
              <StudioModelPicker
                options={options}
                value={modelId}
                onValueChange={setModelId}
                isLoading={isLoading}
                onRefresh={() => void refresh()}
              />
              {model && model.aspectRatios.length > 0 && effectiveAspect ? (
                <StudioOptionChip
                  label="نسبت تصویر"
                  value={effectiveAspect}
                  onValueChange={setAspectRatio}
                  icon={<AspectRatioGlyph ratio={effectiveAspect} />}
                  options={model.aspectRatios.map((ratio) => ({ value: ratio, label: ratio }))}
                />
              ) : null}
              {model && model.durations.length > 0 && effectiveDuration ? (
                <StudioOptionChip
                  label="مدت"
                  value={String(effectiveDuration)}
                  onValueChange={(value) => setDuration(Number(value))}
                  icon={<ClockIcon className="size-3.5 opacity-70" />}
                  options={model.durations.map((seconds) => ({
                    value: String(seconds),
                    label: `${seconds.toLocaleString("fa-IR")} ثانیه`,
                    detail: model.minPricePerSecond
                      ? formatStudioCost(model.minPricePerSecond * seconds) ?? undefined
                      : undefined,
                  }))}
                />
              ) : null}
              {model && model.resolutions.length > 0 && effectiveResolution ? (
                <StudioOptionChip
                  label="کیفیت"
                  value={effectiveResolution}
                  onValueChange={setResolution}
                  icon={<MonitorIcon className="size-3.5 opacity-70" />}
                  options={model.resolutions.map((value) => ({ value, label: value }))}
                />
              ) : null}
              {model?.supportsAudio ? (
                <Toggle
                  size="sm"
                  variant="outline"
                  pressed={withAudio}
                  onPressedChange={setWithAudio}
                  aria-label="ساخت صدا همراه ویدیو"
                  className="h-8 rounded-full border-border/70 bg-muted/60 px-2.5 text-xs shadow-none"
                >
                  {withAudio ? <Volume2Icon /> : <VolumeXIcon />}
                  {withAudio ? "با صدا" : "بی‌صدا"}
                </Toggle>
              ) : null}
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className="rounded-full"
                      aria-label="فریم آغازین"
                      disabled={model ? !model.supportsFirstFrame : false}
                      onClick={() => fileInputRef.current?.click()}
                    />
                  }
                >
                  <ImageUpIcon />
                </TooltipTrigger>
                <TooltipContent>
                  {model && !model.supportsFirstFrame
                    ? "این مدل فریم آغازین نمی‌پذیرد"
                    : "تصویر به ویدیو: انتخاب فریم آغازین"}
                </TooltipContent>
              </Tooltip>
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
            </>
          }
        />
        <p className="px-2 text-[11px] text-muted-foreground">
          ساخت ویدیو معمولاً چند دقیقه طول می‌کشد و در پس‌زمینه ادامه پیدا می‌کند، حتی اگر از این بخش خارج شوید.
        </p>
      </div>

      <StudioGallery
        kind="video"
        empty={
          <StudioEmptyHero
            icon={<FilmIcon />}
            title="ایده را به ویدیو تبدیل کنید"
            description="با Veo، Kling، Seedance و مدل‌های دیگر ویدیو بسازید؛ یا یک تصویر را به عنوان فریم آغازین بدهید."
            suggestions={SUGGESTIONS}
            onSuggestion={setPrompt}
          />
        }
      />

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>ساخت این ویدیو حدود {formatStudioCost(estimate)} هزینه دارد</AlertDialogTitle>
            <AlertDialogDescription>
              مبلغ از اعتبار OpenRouter شما کسر می‌شود. هزینه نهایی پس از ساخت در جزئیات ویدیو نمایش داده می‌شود.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>انصراف</AlertDialogCancel>
            <AlertDialogAction onClick={() => void generate()}>ساخت ویدیو</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
