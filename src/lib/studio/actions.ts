import type { StudioItem } from "./types";

function stringParam(item: StudioItem, key: string) {
  const value = item.params[key];
  return typeof value === "string" && value ? value : undefined;
}

/**
 * Re-runs a failed or interrupted generation with its saved settings and
 * removes the old attempt so history keeps a single entry per request.
 */
export async function retryStudioItem(item: StudioItem) {
  if (item.kind === "image") {
    const referenceIds = Array.isArray(item.params.referenceItemIds)
      ? item.params.referenceItemIds.filter(
          (id): id is string => typeof id === "string"
        )
      : [];
    await window.desktop.studio.generateImages({
      modelId: item.modelId,
      prompt: item.prompt,
      aspectRatio: stringParam(item, "aspectRatio"),
      count: 1,
      references: referenceIds.map((itemId) => ({ type: "item", itemId })),
    });
  } else if (item.kind === "video") {
    const duration = item.params.duration;
    const generateAudio = item.params.generateAudio;
    await window.desktop.studio.generateVideo({
      modelId: item.modelId,
      prompt: item.prompt,
      aspectRatio: stringParam(item, "aspectRatio"),
      resolution: stringParam(item, "resolution"),
      duration: typeof duration === "number" ? duration : undefined,
      generateAudio: typeof generateAudio === "boolean" ? generateAudio : undefined,
      firstFrame: item.parentId ? { type: "item", itemId: item.parentId } : undefined,
    });
  } else if (item.kind === "speech") {
    const speed = item.params.speed;
    await window.desktop.studio.generateSpeech({
      provider: item.provider === "elevenlabs" ? "elevenlabs" : "openrouter",
      modelId: item.modelId,
      voice: stringParam(item, "voice") ?? "",
      input: item.text ?? item.prompt,
      instructions: stringParam(item, "instructions"),
      speed: typeof speed === "number" ? speed : undefined,
    });
  } else {
    return;
  }
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
