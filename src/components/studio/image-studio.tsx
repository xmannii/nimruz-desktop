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
  StudioShortcutHint,
} from "@/components/studio/studio-prompt-box";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useStudioCatalog } from "@/hooks/use-studio-catalog";
import { readFileAsDataUrl } from "@/lib/studio/actions";
import { studioMediaUrl } from "@/lib/studio/format";
import {
  DEFAULT_STUDIO_PREFERENCES,
  loadStudioPreferences,
  saveStudioPreferences,
} from "@/lib/studio/preferences";
import { STUDIO_LIMITS, type StudioItem } from "@/lib/studio/types";
import { cn } from "@/lib/utils";
import { CopyIcon, ImageIcon, ImagePlusIcon, XIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { toast } from "sonner";

const ASPECT_RATIOS = ["1:1", "4:5", "3:4", "2:3", "9:16", "4:3", "3:2", "16:9", "21:9"];

const SUGGESTIONS = [
  "کوچه‌ای در یزد هنگام غروب، نور گرم و سایه‌های بلند",
  "پوستر مینیمال یک فنجان چای با بخار، پس‌زمینه کرم",
  "عکس محصول از ساعت مچی روی سنگ سیاه، نور استودیویی",
  "Isometric cozy reading room, soft pastel colors, 3D render",
];

type Reference =
  | { key: string; type: "item"; item: StudioItem }
  | { key: string; type: "data-url"; dataUrl: string };

export function ImageStudio() {
  const { draft, clearDraft } = useStudio();
  const { catalog, isLoading, refresh } = useStudioCatalog();
  const keyConfigured = useOpenRouterKeyConfigured();
  const preferences = useMemo(loadStudioPreferences, []);
  const [prompt, setPrompt] = useState("");
  const [modelId, setModelId] = useState(
    preferences.imageModelId ?? DEFAULT_STUDIO_PREFERENCES.imageModelId
  );
  const [aspectRatio, setAspectRatio] = useState(
    preferences.imageAspectRatio ?? DEFAULT_STUDIO_PREFERENCES.imageAspectRatio
  );
  const [count, setCount] = useState(
    preferences.imageCount ?? DEFAULT_STUDIO_PREFERENCES.imageCount
  );
  const [references, setReferences] = useState<Reference[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const models = catalog?.image ?? [];
  const selectedModel = models.find((model) => model.id === modelId) ?? null;
  const acceptsImages = selectedModel?.acceptsImageInput ?? true;

  useEffect(() => {
    if (models.length > 0 && !selectedModel) setModelId(models[0].id);
  }, [models, selectedModel]);

  useEffect(() => {
    if (draft?.tab !== "image") return;
    if (draft.prompt !== undefined) setPrompt(draft.prompt);
    if (draft.modelId) setModelId(draft.modelId);
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

  const options: StudioModelOption[] = useMemo(
    () =>
      models.map((model) => ({
        key: model.id,
        id: model.id,
        name: model.name,
        meta: model.acceptsImageInput ? "متن و تصویر مرجع" : "فقط متن",
      })),
    [models]
  );

  async function addFiles(files: File[]) {
    const images = files.filter((file) => file.type.startsWith("image/"));
    const room = STUDIO_LIMITS.maxReferenceImages - references.length;
    if (images.length === 0 || room <= 0) {
      if (room <= 0) toast.info("حداکثر چهار تصویر مرجع.");
      return;
    }
    const accepted: Reference[] = [];
    for (const file of images.slice(0, room)) {
      if (file.size > STUDIO_LIMITS.maxReferenceImageBytes) {
        toast.error(`«${file.name}» بزرگ‌تر از ۸ مگابایت است.`);
        continue;
      }
      try {
        accepted.push({
          key: crypto.randomUUID(),
          type: "data-url",
          dataUrl: await readFileAsDataUrl(file),
        });
      } catch {
        toast.error("خواندن تصویر ناموفق بود.");
      }
    }
    setReferences((current) => [...current, ...accepted]);
  }

  async function submit() {
    setIsSubmitting(true);
    try {
      await window.desktop.studio.generateImages({
        modelId,
        prompt,
        aspectRatio,
        count,
        references: acceptsImages
          ? references.map((reference) =>
              reference.type === "item"
                ? { type: "item" as const, itemId: reference.item.id }
                : { type: "data-url" as const, dataUrl: reference.dataUrl }
            )
          : [],
      });
      saveStudioPreferences({ imageModelId: modelId, imageAspectRatio: aspectRatio, imageCount: count });
      setPrompt("");
      setReferences([]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "شروع ساخت ناموفق بود.");
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragging(false);
    void addFiles(Array.from(event.dataTransfer.files));
  }

  const attachments =
    references.length > 0 ? (
      <div className="flex flex-wrap gap-2">
        {references.map((reference) => (
          <div
            key={reference.key}
            className={cn(
              "group/ref relative size-16 overflow-hidden rounded-xl ring-1 ring-foreground/10",
              !acceptsImages && "opacity-40 grayscale"
            )}
          >
            <img
              src={reference.type === "item" ? studioMediaUrl(reference.item) : reference.dataUrl}
              alt="تصویر مرجع"
              className="size-full object-cover"
            />
            <button
              type="button"
              aria-label="حذف تصویر مرجع"
              className="absolute end-1 top-1 flex size-5 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition-opacity group-hover/ref:opacity-100 focus-visible:opacity-100"
              onClick={() =>
                setReferences((current) => current.filter((candidate) => candidate.key !== reference.key))
              }
            >
              <XIcon className="size-3" />
            </button>
          </div>
        ))}
        {!acceptsImages ? (
          <p className="self-center text-[11px] text-muted-foreground">
            این مدل تصویر مرجع نمی‌پذیرد.
          </p>
        ) : null}
      </div>
    ) : null;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-6 sm:px-8">
      <div
        className={cn("flex flex-col gap-3 rounded-[1.75rem] transition-colors", isDragging && "bg-primary/5 ring-2 ring-primary/40 ring-offset-4 ring-offset-background")}
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
        {keyConfigured === false ? <StudioKeyNotice /> : null}
        <StudioPromptBox
          value={prompt}
          onValueChange={setPrompt}
          onSubmit={() => void submit()}
          placeholder="تصویری که در ذهن دارید را توصیف کنید…"
          maxLength={STUDIO_LIMITS.prompt}
          canSubmit={Boolean(prompt.trim() && modelId && keyConfigured !== false)}
          isSubmitting={isSubmitting}
          submitLabel={count > 1 ? `ساخت ${count.toLocaleString("fa-IR")} تصویر` : "ساخت تصویر"}
          attachments={attachments}
          onPasteImages={(files) => void addFiles(files)}
          hint={<StudioShortcutHint />}
          toolbar={
            <>
              <StudioModelPicker
                options={options}
                value={modelId}
                onValueChange={setModelId}
                isLoading={isLoading}
                onRefresh={() => void refresh()}
              />
              <StudioOptionChip
                label="نسبت تصویر"
                value={aspectRatio}
                onValueChange={setAspectRatio}
                icon={<AspectRatioGlyph ratio={aspectRatio} />}
                options={ASPECT_RATIOS.map((ratio) => ({ value: ratio, label: ratio }))}
              />
              <StudioOptionChip
                label="تعداد"
                value={String(count)}
                onValueChange={(value) => setCount(Number(value))}
                icon={<CopyIcon className="size-3.5 opacity-70" />}
                options={[1, 2, 3, 4].map((value) => ({
                  value: String(value),
                  label: `${value.toLocaleString("fa-IR")} تصویر`,
                }))}
              />
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className="rounded-full"
                      aria-label="افزودن تصویر مرجع"
                      disabled={!acceptsImages || references.length >= STUDIO_LIMITS.maxReferenceImages}
                      onClick={() => fileInputRef.current?.click()}
                    />
                  }
                >
                  <ImagePlusIcon />
                </TooltipTrigger>
                <TooltipContent>
                  {acceptsImages ? "تصویر مرجع (کشیدن، چسباندن یا انتخاب)" : "این مدل تصویر مرجع نمی‌پذیرد"}
                </TooltipContent>
              </Tooltip>
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
            </>
          }
        />
      </div>

      <StudioGallery
        kind="image"
        empty={
          <StudioEmptyHero
            icon={<ImageIcon />}
            title="هر چه در ذهن دارید، تصویر کنید"
            description="از ده‌ها مدل تصویری OpenRouter استفاده کنید. برای ویرایش، تصویر مرجع را بکشید یا بچسبانید."
            suggestions={SUGGESTIONS}
            onSuggestion={setPrompt}
          />
        }
      />
    </div>
  );
}
