import type { StudioItem } from "./types";

function stringParam(item: StudioItem, key: string) {
  const value = item.params[key];
  return typeof value === "string" && value ? value : undefined;
}

function mediaProvider(item: StudioItem) {
  return item.provider === "google" ? ("google" as const) : ("openrouter" as const);
}

function styleOf(item: StudioItem) {
  const id = stringParam(item, "style");
  const prompt = stringParam(item, "stylePrompt");
  return id && prompt ? { id, prompt } : undefined;
}

/** Re-sends the same request as a new generation (keeps the original). */
export async function regenerateStudioItem(item: StudioItem, count = 1) {
  if (item.kind === "image") {
    await window.desktop.studio.generateImages({
      provider: mediaProvider(item),
      modelId: item.modelId,
      prompt: item.prompt,
      style: styleOf(item),
      aspectRatio: stringParam(item, "aspectRatio"),
      count,
      references: referenceIds(item).map((itemId) => ({ type: "item" as const, itemId })),
    });
  } else if (item.kind === "video") {
    const duration = item.params.duration;
    const generateAudio = item.params.generateAudio;
    await window.desktop.studio.generateVideo({
      provider: mediaProvider(item),
      modelId: item.modelId,
      prompt: item.prompt,
      style: styleOf(item),
      aspectRatio: stringParam(item, "aspectRatio"),
      resolution: stringParam(item, "resolution"),
      duration: typeof duration === "number" ? duration : undefined,
      generateAudio: typeof generateAudio === "boolean" ? generateAudio : undefined,
      firstFrame: item.parentId ? { type: "item", itemId: item.parentId } : undefined,
    });
  } else if (item.kind === "speech") {
    const speed = item.params.speed;
    await window.desktop.studio.generateSpeech({
      provider:
        item.provider === "elevenlabs" || item.provider === "google"
          ? item.provider
          : "openrouter",
      modelId: item.modelId,
      voice: stringParam(item, "voice") ?? "",
      input: item.text ?? item.prompt,
      instructions: stringParam(item, "instructions"),
      speed: typeof speed === "number" ? speed : undefined,
    });
  }
}

function referenceIds(item: StudioItem) {
  return Array.isArray(item.params.referenceItemIds)
    ? item.params.referenceItemIds.filter((id): id is string => typeof id === "string")
    : [];
}

/**
 * Re-runs a failed or interrupted generation with its saved settings and
 * removes the old attempt so history keeps a single entry per request.
 */
export async function retryStudioItem(item: StudioItem) {
  if (item.kind === "transcript") return;
  await regenerateStudioItem(item);
  await window.desktop.studio.delete(item.id);
}

export async function copyText(text: string) {
  await navigator.clipboard.writeText(text);
}

export function readFileAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      typeof reader.result === "string"
        ? resolve(reader.result)
        : reject(new Error("خواندن فایل ناموفق بود."));
    reader.onerror = () => reject(reader.error ?? new Error("خواندن فایل ناموفق بود."));
    reader.readAsDataURL(file);
  });
}
