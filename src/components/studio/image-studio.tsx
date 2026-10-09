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
import { Button } from "@/components/ui/button";
import { useStudioCatalog } from "@/hooks/use-studio-catalog";
import { useImageModelOptions } from "@/hooks/use-studio-model-options";
import { readFileAsDataUrl } from "@/lib/studio/actions";
import { studioMediaUrl } from "@/lib/studio/format";
import {
  DEFAULT_STUDIO_PREFERENCES,
  loadStudioPreferences,
  saveStudioPreferences,
} from "@/lib/studio/preferences";
import { findPreset, IMAGE_STYLES } from "@/lib/studio/presets";
import { STUDIO_LIMITS, type StudioItem } from "@/lib/studio/types";
import { cn } from "@/lib/utils";
import { CopyIcon, ImageIcon, ImagePlusIcon, PlugIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

const ALL_RATIOS = ["1:1", "4:5", "3:4", "2:3", "9:16", "5:4", "4:3", "3:2", "16:9", "21:9"];
const IMAGEN_RATIOS = ["1:1", "3:4", "4:3", "9:16", "16:9"];

type Reference =
  | { key: string; type: "item"; item: StudioItem }
  | { key: string; type: "data-url"; dataUrl: string };

export function ImageStudio() {
  const { draft, clearDraft, openConnections } = useStudio();
  const { catalog, isLoading, refresh } = useStudioCatalog();
  const openRouterReady = useOpenRouterKeyConfigured();
  const preferences = useMemo(loadStudioPreferences, []);
  const [prompt, setPrompt] = useState("");
  const [modelKey, setModelKey] = useState(
    preferences.imageModelKey ?? DEFAULT_STUDIO_PREFERENCES.imageModelKey
  );
  const [aspectRatio, setAspectRatio] = useState(
    preferences.imageAspectRatio ?? DEFAULT_STUDIO_PREFERENCES.imageAspectRatio
  );
  const [count, setCount] = useState(
    preferences.imageCount ?? DEFAULT_STUDIO_PREFERENCES.imageCount
  );
  const [styleId, setStyleId] = useState(preferences.imageStyle ?? "none");
  const [references, setReferences] = useState<Reference[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const models = useMemo(() => catalog?.image ?? [], [catalog]);
  const options = useImageModelOptions(models);
  const model = models.find((candidate) => studioModelKey(candidate.provider, candidate.id) === modelKey) ?? null;
  const acceptsImages = model?.acceptsImageInput ?? true;
  const ratios = model?.provider === "google" && model.id.startsWith("imagen") ? IMAGEN_RATIOS : ALL_RATIOS;
  const effectiveRatio = ratios.includes(aspectRatio) ? aspectRatio : "1:1";
  const needsOpenRouter = (model?.provider ?? parseStudioModelKey(modelKey).provider) === "openrouter";

  useEffect(() => {
    if (models.length === 0 || model) return;
    const fallback = options.filter((option) => typeof option.rank === "number").sort((a, b) => a.rank! - b.rank!)[0] ?? options[0];
    if (fallback) setModelKey(fallback.key);
  }, [models, model, options]);

  useEffect(() => {
    if (draft?.tab !== "image") return;
    if (draft.prompt !== undefined) setPrompt(draft.prompt);
    if (draft.modelKey) setModelKey(draft.modelKey);
    if (draft.styleId) setStyleId(draft.styleId);
    if (draft.aspectRatio) setAspectRatio(draft.aspectRatio);
    if (draft.referenceItem) {
      const item = draft.referenceItem;
      setReferences((current) =>
        current.some((reference) => reference.type === "item" && reference.item.id === item.id)
          ? current
          : [...current, { key: item.id, type: "item" as const, item }].slice(-STUDIO_LIMITS.maxReferenceImages)
      );
    }
    clearDraft();
  }, [draft, clearDraft]);

  async function addFiles(files: File[]) {
    const images = files.filter((file) => file.type.startsWith("image/"));
    const room = STUDIO_LIMITS.maxReferenceImages - references.length;
    if (images.length === 0) return;
    if (room <= 0) {
      toast.info("حداکثر چهار تصویر مرجع می‌توانید اضافه کنید.");
      return;
    }
    const accepted: Reference[] = [];
    for (const file of images.slice(0, room)) {
      if (file.size > STUDIO_LIMITS.maxReferenceImageBytes) {
        toast.error(`«${file.name}» بزرگ‌تر از ۸ مگابایت است.`);
        continue;
      }
      try {
        accepted.push({ key: crypto.randomUUID(), type: "data-url", dataUrl: await readFileAsDataUrl(file) });
      } catch {
        toast.error("خواندن تصویر ناموفق بود.");
      }
    }
    setReferences((current) => [...current, ...accepted]);
  }

  async function submit() {
    const { provider, modelId } = parseStudioModelKey(modelKey);
    const style = findPreset(IMAGE_STYLES, styleId);
    setIsSubmitting(true);
    try {
      await window.desktop.studio.generateImages({
        provider: provider === "google" ? "google" : "openrouter",
        modelId,
        prompt,
        style: style.prompt ? { id: style.id, prompt: style.prompt } : undefined,
        aspectRatio: effectiveRatio,
        count,
        references: acceptsImages
          ? references.map((reference) =>
              reference.type === "item"
                ? { type: "item" as const, itemId: reference.item.id }
                : { type: "data-url" as const, dataUrl: reference.dataUrl }
            )
          : [],
      });
      saveStudioPreferences({
        imageModelKey: modelKey,
        imageAspectRatio: effectiveRatio,
        imageCount: count,
        imageStyle: styleId,
      });
      // Keep the prompt so it is easy to iterate; references are one-shot.
      setReferences([]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "شروع ساخت ناموفق بود.");
    } finally {
      setIsSubmitting(false);
    }
  }

  function reuse(item: StudioItem) {
    setPrompt(item.prompt);
    setModelKey(studioModelKey(item.provider, item.modelId));
    if (typeof item.params.style === "string") setStyleId(item.params.style);
    else setStyleId("none");
    if (typeof item.params.aspectRatio === "string") setAspectRatio(item.params.aspectRatio);
  }

  const composer = (
    <StudioComposer
      value={prompt}
      onValueChange={setPrompt}
      onSubmit={() => void submit()}
      placeholder="چه تصویری در ذهن دارید؟ فارسی یا انگلیسی بنویسید…"
      maxLength={STUDIO_LIMITS.prompt}
      canSubmit={Boolean(prompt.trim() && model && (!needsOpenRouter || openRouterReady !== false))}
      isSubmitting={isSubmitting}
      submitLabel={count > 1 ? `ساخت ${count.toLocaleString("fa-IR")} تصویر` : "ساخت تصویر"}
      enhanceKind="image"
      onPasteImages={(files) => void addFiles(files)}
      notice={needsOpenRouter && openRouterReady === false ? <StudioKeyNotice /> : null}
      footer={count > 1 ? `${count.toLocaleString("fa-IR")} تصویر در هر بار ساخت` : null}
      attachments={
        references.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2">
            {references.map((reference) => (
              <StudioAttachmentThumb
                key={reference.key}
                src={reference.type === "item" ? studioMediaUrl(reference.item) : reference.dataUrl}
                label="تصویر مرجع"
                muted={!acceptsImages}
                onRemove={() => setReferences((current) => current.filter((candidate) => candidate.key !== reference.key))}
              />
            ))}
            <p className="text-[11px] leading-5 text-muted-foreground">
              {acceptsImages ? "تصویر مرجع؛ بگویید چه چیزی تغییر کند." : "این مدل تصویر مرجع نمی‌پذیرد."}
            </p>
          </div>
        ) : null
      }
      toolbar={
        <>
          <button
            type="button"
            className={cn(studioPillClass, "px-2")}
            aria-label="افزودن تصویر مرجع"
            title={acceptsImages ? "تصویر مرجع (کشیدن، چسباندن یا انتخاب)" : "این مدل تصویر مرجع نمی‌پذیرد"}
            disabled={!acceptsImages || references.length >= STUDIO_LIMITS.maxReferenceImages}
            onClick={() => fileInputRef.current?.click()}
          >
            <ImagePlusIcon className="size-4" />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            multiple
            className="sr-only"
            onChange={(event) => {
              if (event.target.files) void addFiles(Array.from(event.target.files));
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
                اتصال Google AI Studio و سرویس‌های دیگر
              </Button>
            }
          />
          <PresetPicker presets={IMAGE_STYLES} value={styleId} onValueChange={setStyleId} label="سبک" />
          <AspectRatioPicker value={effectiveRatio} onValueChange={setAspectRatio} ratios={ratios} />
          <StudioOptionChip
            label="تعداد"
            value={String(count)}
            onValueChange={(value) => setCount(Number(value))}
            icon={<CopyIcon className="size-3.5 opacity-70" />}
            renderValue={(option) => option?.label.split(" ")[0]}
            options={[1, 2, 3, 4].map((value) => ({
              value: String(value),
              label: `${value.toLocaleString("fa-IR")} تصویر`,
            }))}
          />
        </>
      }
    />
  );

  return (
    <StudioFeed
      kind="image"
      composer={composer}
      onReuse={reuse}
      onDropFiles={(files) => void addFiles(files)}
      empty={
        <StudioEmptyState
          icon={<ImageIcon />}
          title="اولین تصویرتان را بسازید"
          description="فارسی یا انگلیسی بنویسید. برای ویرایش، تصویری را بکشید یا بچسبانید."
        />
      }
    />
  );
}
