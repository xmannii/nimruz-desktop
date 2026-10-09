"use client";

import { ImageStudio } from "@/components/studio/image-studio";
import { SpeechStudio } from "@/components/studio/speech-studio";
import {
  StudioContextProvider,
  type StudioContextValue,
  type StudioDraft,
} from "@/components/studio/studio-context";
import { StudioHistorySheet } from "@/components/studio/studio-history-sheet";
import { StudioItemViewer } from "@/components/studio/studio-item-viewer";
import { TranscribeStudio } from "@/components/studio/transcribe-studio";
import { VideoStudio } from "@/components/studio/video-studio";
import { useSpeech } from "@/components/speech/speech-provider";
import { Button } from "@/components/ui/button";
import {
  isStudioItemBusy,
  STUDIO_TAB_LABELS,
  STUDIO_TABS,
  studioKindTab,
  type StudioTab,
} from "@/lib/studio/format";
import { saveStudioPreferences } from "@/lib/studio/preferences";
import type { StudioItem } from "@/lib/studio/types";
import { cn } from "@/lib/utils";
import { useNavigate } from "@tanstack/react-router";
import {
  AudioLinesIcon,
  FileAudioIcon,
  FilmIcon,
  HistoryIcon,
  ImageIcon,
  SparklesIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const TAB_ICONS: Record<StudioTab, typeof ImageIcon> = {
  image: ImageIcon,
  video: FilmIcon,
  speech: AudioLinesIcon,
  transcribe: FileAudioIcon,
};

const TAB_COMPONENTS: Record<StudioTab, () => React.JSX.Element> = {
  image: ImageStudio,
  video: VideoStudio,
  speech: SpeechStudio,
  transcribe: TranscribeStudio,
};

/** Tabs with work still running, so users can see progress elsewhere. */
function useBusyTabs() {
  const [busy, setBusy] = useState<Map<string, StudioTab>>(new Map());
  const { hasBusyItems, isLiveRecording } = useSpeech();

  useEffect(() => {
    const track = (item: StudioItem) =>
      setBusy((current) => {
        const next = new Map(current);
        if (isStudioItemBusy(item)) next.set(item.id, studioKindTab(item.kind));
        else next.delete(item.id);
        return next.size === current.size && next.get(item.id) === current.get(item.id)
          ? current
          : next;
      });
    void window.desktop.studio
      .list({ limit: 100 })
      .then((items) => items.forEach(track))
      .catch(() => undefined);
    const offChange = window.desktop.studio.onItemChange(track);
    const offDelete = window.desktop.studio.onItemDelete((id) =>
      setBusy((current) => {
        if (!current.has(id)) return current;
        const next = new Map(current);
        next.delete(id);
        return next;
      })
    );
    return () => {
      offChange();
      offDelete();
    };
  }, []);

  return useMemo(() => {
    const tabs = new Set(busy.values());
    if (hasBusyItems || isLiveRecording) tabs.add("transcribe");
    return tabs;
  }, [busy, hasBusyItems, isLiveRecording]);
}

export function StudioPage({ tab }: { tab: StudioTab }) {
  const navigate = useNavigate();
  const [visited, setVisited] = useState<Set<StudioTab>>(() => new Set([tab]));
  const [viewerItem, setViewerItem] = useState<StudioItem | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [draft, setDraft] = useState<StudioDraft | null>(null);
  const busyTabs = useBusyTabs();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setVisited((current) => (current.has(tab) ? current : new Set(current).add(tab)));
    scrollRef.current?.scrollTo({ top: 0 });
    saveStudioPreferences({ lastTab: tab });
  }, [tab]);

  // Keep the open viewer in sync with background progress and edits.
  useEffect(() => {
    if (!viewerItem) return;
    const offChange = window.desktop.studio.onItemChange((item) => {
      if (item.id === viewerItem.id) setViewerItem(item);
    });
    const offDelete = window.desktop.studio.onItemDelete((id) => {
      if (id === viewerItem.id) setViewerItem(null);
    });
    return () => {
      offChange();
      offDelete();
    };
  }, [viewerItem]);

  const setTab = useCallback(
    (next: StudioTab) => {
      void navigate({ to: "/studio", search: { tab: next }, replace: true });
    },
    [navigate]
  );

  const sendDraft = useCallback(
    (next: StudioDraft) => {
      setDraft(next);
      setTab(next.tab);
    },
    [setTab]
  );

  const clearDraft = useCallback(() => setDraft(null), []);

  const contextValue = useMemo<StudioContextValue>(
    () => ({ tab, setTab, openItem: setViewerItem, draft, sendDraft, clearDraft }),
    [tab, setTab, draft, sendDraft, clearDraft]
  );

  return (
    <StudioContextProvider value={contextValue}>
      <div dir="rtl" className="flex h-full min-h-0 flex-col bg-background">
        <header className="flex shrink-0 items-center gap-3 border-b border-border/60 px-4 py-2.5 sm:px-6">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/25 via-primary/10 to-transparent text-primary ring-1 ring-primary/15">
              <SparklesIcon className="size-4" />
            </span>
            <div className="hidden min-w-0 sm:block">
              <h1 className="text-sm font-semibold leading-5">استودیو</h1>
              <p className="truncate text-[11px] text-muted-foreground">
                ساخت تصویر، ویدیو و صدا؛ رونویسی گفتار
              </p>
            </div>
          </div>

          <nav
            aria-label="بخش‌های استودیو"
            className="mx-auto flex items-center gap-0.5 rounded-full bg-muted p-1"
          >
            {STUDIO_TABS.map((value) => {
              const Icon = TAB_ICONS[value];
              const active = value === tab;
              return (
                <button
                  key={value}
                  type="button"
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium text-muted-foreground transition-all hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
                    active && "bg-background text-foreground shadow-sm dark:bg-input/40"
                  )}
                  onClick={() => setTab(value)}
                >
                  <Icon className="size-4" />
                  <span className="hidden sm:inline">{STUDIO_TAB_LABELS[value]}</span>
                  {busyTabs.has(value) ? (
                    <span
                      className="absolute end-1.5 top-1.5 size-1.5 animate-pulse rounded-full bg-primary"
                      aria-label="در حال پردازش"
                    />
                  ) : null}
                </button>
              );
            })}
          </nav>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="shrink-0 rounded-full"
            onClick={() => setHistoryOpen(true)}
          >
            <HistoryIcon data-icon="inline-start" />
            <span className="hidden md:inline">تاریخچه</span>
          </Button>
        </header>

        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {STUDIO_TABS.filter((value) => visited.has(value)).map((value) => {
            const Component = TAB_COMPONENTS[value];
            return (
              <div key={value} hidden={value !== tab}>
                <Component />
              </div>
            );
          })}
        </div>
      </div>

      <StudioItemViewer
        item={viewerItem}
        onOpenChange={(open) => {
          if (!open) setViewerItem(null);
        }}
      />
      <StudioHistorySheet open={historyOpen} onOpenChange={setHistoryOpen} />
    </StudioContextProvider>
  );
}
