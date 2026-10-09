"use client";

import { ImageStudio } from "@/components/studio/image-studio";
import { SpeechStudio } from "@/components/studio/speech-studio";
import { StudioConnectionsDialog } from "@/components/studio/studio-connections-dialog";
import {
  StudioContextProvider,
  type StudioContextValue,
  type StudioDraft,
} from "@/components/studio/studio-context";
import { StudioHistorySheet } from "@/components/studio/studio-history-sheet";
import { StudioItemViewer } from "@/components/studio/studio-item-viewer";
import { StudioTour } from "@/components/studio/studio-tour";
import { TranscribeStudio } from "@/components/studio/transcribe-studio";
import { VideoStudio } from "@/components/studio/video-studio";
import { useSpeech } from "@/components/speech/speech-provider";
import { Button } from "@/components/ui/button";
import {
  isStudioItemBusy,
  STUDIO_KIND_LABELS,
  STUDIO_TAB_LABELS,
  STUDIO_TABS,
  studioKindTab,
  type StudioTab,
} from "@/lib/studio/format";
import { loadStudioPreferences, saveStudioPreferences } from "@/lib/studio/preferences";
import type { StudioItem } from "@/lib/studio/types";
import { cn } from "@/lib/utils";
import { useNavigate } from "@tanstack/react-router";
import {
  AudioLinesIcon,
  CircleHelpIcon,
  FileAudioIcon,
  FilmIcon,
  HistoryIcon,
  ImageIcon,
  PlugIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type JSX } from "react";
import { toast } from "sonner";

const TAB_ICONS: Record<StudioTab, typeof ImageIcon> = {
  image: ImageIcon,
  video: FilmIcon,
  speech: AudioLinesIcon,
  transcribe: FileAudioIcon,
};

const TAB_DESCRIPTIONS: Record<StudioTab, string> = {
  image: "ساخت و ویرایش تصویر با OpenRouter، Google و FLUX",
  video: "متن یا تصویر را به ویدیو تبدیل کنید",
  speech: "متن را با صدای طبیعی بخوانید",
  transcribe: "گفتار به متن؛ خصوصی روی دستگاه یا با Gemini",
};

const TAB_COMPONENTS: Record<StudioTab, () => JSX.Element> = {
  image: ImageStudio,
  video: VideoStudio,
  speech: SpeechStudio,
  transcribe: TranscribeStudio,
};

/**
 * Opens the Studio tour on the first visit, once no other dialog (app
 * onboarding, What's New) is in the way. Gives up quietly after a while and
 * tries again on the next visit.
 */
function useFirstRunTour(start: () => void) {
  const startRef = useRef(start);
  startRef.current = start;

  useEffect(() => {
    if (loadStudioPreferences().tourCompleted) return;
    let timer = 0;
    const attempt = (remaining: number) => {
      if (document.querySelector('[role="dialog"], [role="alertdialog"]')) {
        if (remaining > 0) timer = window.setTimeout(() => attempt(remaining - 1), 1000);
        return;
      }
      startRef.current();
    };
    // Let the tab and sidebar settle so the spotlight lands on real controls.
    timer = window.setTimeout(() => attempt(60), 700);
    return () => window.clearTimeout(timer);
  }, []);
}

/**
 * Tracks running work per tab and announces finished generations that
 * happened outside the tab you are looking at.
 */
function useStudioActivity(tab: StudioTab, onOpen: (item: StudioItem) => void) {
  const [busy, setBusy] = useState<Map<string, StudioTab>>(new Map());
  const tabRef = useRef(tab);
  const openRef = useRef(onOpen);
  const { hasBusyItems, isLiveRecording } = useSpeech();
  tabRef.current = tab;
  openRef.current = onOpen;

  useEffect(() => {
    const running = new Set<string>();
    const track = (item: StudioItem) => {
      const wasRunning = running.has(item.id);
      if (isStudioItemBusy(item)) running.add(item.id);
      else running.delete(item.id);

      if (wasRunning && !isStudioItemBusy(item) && item.kind !== "transcript") {
        const itemTab = studioKindTab(item.kind);
        const away = itemTab !== tabRef.current || document.visibilityState === "hidden";
        if (item.status === "done" && away) {
          toast.success(`${STUDIO_KIND_LABELS[item.kind]} آماده شد`, {
            description: item.title,
            action: { label: "مشاهده", onClick: () => openRef.current(item) },
          });
        } else if (item.status === "failed" && away) {
          toast.error(`ساخت ${STUDIO_KIND_LABELS[item.kind]} ناموفق بود`, { description: item.error ?? undefined });
        }
      }

      setBusy((current) => {
        const isBusy = isStudioItemBusy(item);
        if (isBusy === current.has(item.id)) return current;
        const next = new Map(current);
        if (isBusy) next.set(item.id, studioKindTab(item.kind));
        else next.delete(item.id);
        return next;
      });
    };
    void window.desktop.studio
      .list({ limit: 100 })
      .then((items) => items.forEach(track))
      .catch(() => undefined);
    const offChange = window.desktop.studio.onItemChange(track);
    const offDelete = window.desktop.studio.onItemDelete((id) => {
      running.delete(id);
      setBusy((current) => {
        if (!current.has(id)) return current;
        const next = new Map(current);
        next.delete(id);
        return next;
      });
    });
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

export function StudioPage({
  tab,
  itemId,
  prompt,
}: {
  tab: StudioTab;
  itemId?: string;
  prompt?: string;
}) {
  const navigate = useNavigate();
  const [visited, setVisited] = useState<Set<StudioTab>>(() => new Set([tab]));
  const [viewer, setViewer] = useState<{ item: StudioItem; siblings: StudioItem[] } | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [connectionsOpen, setConnectionsOpen] = useState(false);
  const [draft, setDraft] = useState<StudioDraft | null>(null);
  const [tourOpen, setTourOpen] = useState(false);

  useFirstRunTour(useCallback(() => setTourOpen(true), []));

  const closeTour = useCallback(() => {
    setTourOpen(false);
    saveStudioPreferences({ tourCompleted: true });
  }, []);

  const openItem = useCallback((item: StudioItem, siblings?: StudioItem[]) => {
    setViewer({ item, siblings: siblings ?? [item] });
  }, []);

  const busyTabs = useStudioActivity(tab, openItem);

  // Deep links: open an item or prefill a prompt, then drop the params so
  // a refresh or back navigation does not repeat them.
  useEffect(() => {
    if (!itemId && !prompt) return;
    if (itemId) {
      void window.desktop.studio
        .get(itemId)
        .then((item) => {
          if (item) setViewer({ item, siblings: [item] });
        })
        .catch(() => undefined);
    }
    if (prompt && tab !== "transcribe") {
      setDraft(
        tab === "speech"
          ? { tab: "speech", text: prompt }
          : tab === "video"
            ? { tab: "video", prompt }
            : { tab: "image", prompt }
      );
    }
    void navigate({ to: "/studio", search: { tab }, replace: true });
  }, [itemId, prompt, tab, navigate]);

  useEffect(() => {
    setVisited((current) => (current.has(tab) ? current : new Set(current).add(tab)));
    saveStudioPreferences({ lastTab: tab });
  }, [tab]);

  // Keep the open viewer in sync with background progress and edits.
  const viewerId = viewer?.item.id;
  useEffect(() => {
    if (!viewerId) return;
    const offChange = window.desktop.studio.onItemChange((item) => {
      setViewer((current) =>
        current
          ? {
              item: current.item.id === item.id ? item : current.item,
              siblings: current.siblings.map((sibling) => (sibling.id === item.id ? item : sibling)),
            }
          : current
      );
    });
    const offDelete = window.desktop.studio.onItemDelete((id) => {
      setViewer((current) => {
        if (!current) return current;
        const siblings = current.siblings.filter((sibling) => sibling.id !== id);
        if (current.item.id !== id) return { ...current, siblings };
        return null;
      });
    });
    return () => {
      offChange();
      offDelete();
    };
  }, [viewerId]);

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

  const openConnections = useCallback(() => setConnectionsOpen(true), []);

  const contextValue = useMemo<StudioContextValue>(
    () => ({ tab, setTab, openItem, draft, sendDraft, clearDraft, openConnections }),
    [tab, setTab, openItem, draft, sendDraft, clearDraft, openConnections]
  );

  return (
    <StudioContextProvider value={contextValue}>
      <div dir="rtl" className="flex h-full min-h-0 flex-col bg-background">
        <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border/60 px-3 sm:px-4">
          {/* The sidebar is the section switcher; this header names where you are. */}
          <div className="hidden min-w-0 items-center gap-2.5 md:flex">
            {(() => {
              const Icon = TAB_ICONS[tab];
              return <Icon className="size-4 shrink-0 text-muted-foreground" />;
            })()}
            <h1 className="shrink-0 text-sm font-medium">{STUDIO_TAB_LABELS[tab]}</h1>
            <p className="truncate text-xs text-muted-foreground">{TAB_DESCRIPTIONS[tab]}</p>
          </div>

          {/* Narrow windows hide the sidebar, so keep compact tabs here. */}
          <nav data-studio-tour="tools" aria-label="بخش‌های استودیو" className="flex items-center gap-0.5 md:hidden">
            {STUDIO_TABS.map((value) => {
              const Icon = TAB_ICONS[value];
              const active = value === tab;
              return (
                <button
                  key={value}
                  type="button"
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[13px] text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
                    active && "bg-muted font-medium text-foreground"
                  )}
                  onClick={() => setTab(value)}
                >
                  <Icon className="size-4" />
                  <span className="hidden sm:inline">{STUDIO_TAB_LABELS[value]}</span>
                  {busyTabs.has(value) ? (
                    <span className="size-1.5 rounded-full bg-primary" aria-label="در حال پردازش" />
                  ) : null}
                </button>
              );
            })}
          </nav>

          <div className="ms-auto flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="راهنمای استودیو"
              title="راهنمای استودیو"
              onClick={() => setTourOpen(true)}
            >
              <CircleHelpIcon />
            </Button>
            <Button
              data-studio-tour="services"
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="سرویس‌ها و کلیدها"
              title="سرویس‌ها"
              onClick={openConnections}
            >
              <PlugIcon />
            </Button>
            <Button
              data-studio-tour="history"
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setHistoryOpen(true)}
            >
              <HistoryIcon data-icon="inline-start" />
              <span className="hidden md:inline">تاریخچه</span>
            </Button>
          </div>
        </header>

        <div className="relative min-h-0 flex-1">
          {STUDIO_TABS.filter((value) => visited.has(value)).map((value) => {
            const Component = TAB_COMPONENTS[value];
            return (
              <div key={value} hidden={value !== tab} className="absolute inset-0">
                <Component />
              </div>
            );
          })}
        </div>
      </div>

      <StudioItemViewer
        item={viewer?.item ?? null}
        siblings={viewer?.siblings ?? []}
        onNavigate={(item) => setViewer((current) => (current ? { ...current, item } : current))}
        onOpenChange={(open) => {
          if (!open) setViewer(null);
        }}
      />
      <StudioHistorySheet
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        onOpenItem={(item) => openItem(item)}
      />
      <StudioConnectionsDialog open={connectionsOpen} onOpenChange={setConnectionsOpen} />
      <StudioTour open={tourOpen} onClose={closeTour} />
    </StudioContextProvider>
  );
}
