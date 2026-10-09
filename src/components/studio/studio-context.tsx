"use client";

import type { StudioTab } from "@/lib/studio/format";
import type { StudioItem } from "@/lib/studio/types";
import { createContext, useContext } from "react";

/** Hand-off from one Studio tab to another, e.g. "animate this image". */
export type StudioDraft =
  | {
      tab: "image";
      prompt?: string;
      modelKey?: string;
      styleId?: string;
      aspectRatio?: string;
      referenceItem?: StudioItem;
    }
  | {
      tab: "video";
      prompt?: string;
      modelKey?: string;
      styleId?: string;
      firstFrameItem?: StudioItem;
    }
  | { tab: "speech"; text?: string };

export type StudioView = "feed" | "grid";

export type StudioContextValue = {
  tab: StudioTab;
  setTab: (tab: StudioTab) => void;
  /** Opens the lightbox; siblings enable arrow-key navigation. */
  openItem: (item: StudioItem, siblings?: StudioItem[]) => void;
  draft: StudioDraft | null;
  sendDraft: (draft: StudioDraft) => void;
  clearDraft: () => void;
  view: StudioView;
  setView: (view: StudioView) => void;
  openConnections: () => void;
};

const StudioContext = createContext<StudioContextValue | null>(null);

export const StudioContextProvider = StudioContext.Provider;

export function useStudio() {
  const value = useContext(StudioContext);
  if (!value) throw new Error("useStudio must be used inside the Studio page.");
  return value;
}

/** Model picker keys are `${provider}::${modelId}` so providers can overlap. */
export function studioModelKey(provider: string, modelId: string) {
  return `${provider}::${modelId}`;
}

export function parseStudioModelKey(key: string) {
  const index = key.indexOf("::");
  return index > 0
    ? { provider: key.slice(0, index), modelId: key.slice(index + 2) }
    : { provider: "openrouter", modelId: key };
}
