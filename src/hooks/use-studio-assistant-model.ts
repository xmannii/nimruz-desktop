"use client";

import { useAppShell } from "@/components/app-shell-context";
import type { ProviderModelRef } from "@/lib/models/catalog";
import { loadStudioPreferences, saveStudioPreferences } from "@/lib/studio/preferences";
import { useCallback, useEffect, useState } from "react";

const listeners = new Set<(value: ProviderModelRef | null) => void>();

function readSaved(): ProviderModelRef | null {
  const saved = loadStudioPreferences().assistantModel;
  return saved && typeof saved.providerId === "string" && typeof saved.modelId === "string"
    ? { providerId: saved.providerId, modelId: saved.modelId }
    : null;
}

/**
 * The chat model Studio uses for its helpers: prompt enhancement, ElevenLabs
 * audio tags, and transcript correction. Follows the chat default until the
 * person picks one, and stays in sync across every Studio surface.
 */
export function useStudioAssistantModel() {
  const { defaultModelRef, resolveModel } = useAppShell();
  const [saved, setSaved] = useState<ProviderModelRef | null>(readSaved);

  useEffect(() => {
    listeners.add(setSaved);
    return () => {
      listeners.delete(setSaved);
    };
  }, []);

  // A saved model that was since removed falls back to the chat default.
  const usable = saved && resolveModel(saved) ? saved : null;
  const model = usable ?? defaultModelRef ?? null;

  const setModel = useCallback((value: ProviderModelRef | null) => {
    saveStudioPreferences({ assistantModel: value ?? undefined });
    for (const listener of listeners) listener(value);
  }, []);

  return {
    model,
    setModel,
    /** True while following the chat default rather than a Studio choice. */
    followsDefault: !usable,
    label: model ? (resolveModel(model)?.name ?? model.modelId) : null,
  };
}
