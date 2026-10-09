"use client";

import type { StudioTab } from "@/lib/studio/format";
import type { StudioItem } from "@/lib/studio/types";
import { createContext, useContext } from "react";

/** Hand-off from one Studio tab to another, e.g. "animate this image". */
export type StudioDraft =
  | { tab: "image"; prompt?: string; modelId?: string; referenceItem?: StudioItem }
  | { tab: "video"; prompt?: string; modelId?: string; firstFrameItem?: StudioItem }
  | { tab: "speech"; text?: string };

export type StudioContextValue = {
  tab: StudioTab;
  setTab: (tab: StudioTab) => void;
  openItem: (item: StudioItem) => void;
  draft: StudioDraft | null;
  sendDraft: (draft: StudioDraft) => void;
  clearDraft: () => void;
};

const StudioContext = createContext<StudioContextValue | null>(null);

export const StudioContextProvider = StudioContext.Provider;

export function useStudio() {
  const value = useContext(StudioContext);
  if (!value) throw new Error("useStudio must be used inside the Studio page.");
  return value;
}
