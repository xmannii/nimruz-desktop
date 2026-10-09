"use client";

import { studioModelKey } from "@/components/studio/studio-context";
import type { StudioModelOption } from "@/components/studio/studio-model-picker";
import { featuredRank, isNewModel } from "@/lib/studio/featured";
import { formatStudioCost, modelVendor } from "@/lib/studio/format";
import type {
  StudioImageModel,
  StudioSpeechModel,
  StudioVideoModel,
} from "@/lib/studio/types";
import { useMemo } from "react";

/** Vendor sub-group inside a provider, e.g. "openai" within OpenRouter. */
function groupFor(provider: string, id: string) {
  if (provider === "google") return "google";
  if (provider === "bfl") return "black-forest-labs";
  if (provider === "elevenlabs") return "elevenlabs";
  return modelVendor(id);
}

export function useImageModelOptions(models: StudioImageModel[]) {
  return useMemo<StudioModelOption[]>(
    () =>
      models.map((model) => ({
        key: studioModelKey(model.provider, model.id),
        id: model.id,
        name: model.name,
        provider: model.provider,
        group: groupFor(model.provider, model.id),
        rank: featuredRank("image", model.id),
        isNew: isNewModel(model.createdAt),
        meta: model.acceptsImageInput ? "متن · ویرایش با تصویر مرجع" : "فقط متن",
      })),
    [models]
  );
}

export function useVideoModelOptions(models: StudioVideoModel[]) {
  return useMemo<StudioModelOption[]>(
    () =>
      models.map((model) => ({
        key: studioModelKey(model.provider, model.id),
        id: model.id,
        name: model.name,
        provider: model.provider,
        group: groupFor(model.provider, model.id),
        rank: featuredRank("video", model.id),
        isNew: isNewModel(model.createdAt),
        badge: model.supportsAudio ? "صدا" : undefined,
        meta: [
          `${model.durations[0].toLocaleString("fa-IR")}–${model.durations.at(-1)!.toLocaleString("fa-IR")} ثانیه`,
          model.resolutions.join(" · "),
          model.minPricePerSecond ? `از ${formatStudioCost(model.minPricePerSecond)}/ث` : null,
        ]
          .filter(Boolean)
          .join("  ·  "),
      })),
    [models]
  );
}

export function useSpeechModelOptions(models: StudioSpeechModel[]) {
  return useMemo<StudioModelOption[]>(
    () =>
      models.map((model) => ({
        key: studioModelKey(model.provider, model.id),
        id: model.id,
        name: model.name,
        provider: model.provider,
        group: groupFor(model.provider, model.id),
        rank: featuredRank("speech", model.id),
        isNew: isNewModel(model.createdAt),
        badge: model.supportsInstructions ? "لحن" : undefined,
        meta:
          model.voices.length > 0
            ? `${model.voices.length.toLocaleString("fa-IR")} صدا`
            : "صدای پیش‌فرض",
      })),
    [models]
  );
}
