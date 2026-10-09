"use client";

import { useSpeech } from "@/components/speech/speech-provider";
import { ModelLogo } from "@/components/studio/model-logo";
import type { ModelLogoKey } from "@/components/studio/model-logos.data";
import { StudioConnectionsDialog } from "@/components/studio/studio-connections-dialog";
import { StudioHistorySheet } from "@/components/studio/studio-history-sheet";
import { useOpenRouterKeyConfigured } from "@/components/studio/studio-key-notice";
import { StudioPixelField } from "@/components/studio/studio-pixel-field";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { ModelPicker } from "@/components/chat/model-picker";
import { useStudioAssistantModel } from "@/hooks/use-studio-assistant-model";
import { useStudioConnections } from "@/hooks/use-studio-connections";
import { useStudioItems } from "@/hooks/use-studio-items";
import { useStudioStats } from "@/hooks/use-studio-stats";
import {
  formatStudioCost,
  isStudioItemBusy,
  isStudioTab,
  STUDIO_TAB_LABELS,
  STUDIO_TABS,
  studioKindTab,
  studioMediaUrl,
  studioTabKind,
  type StudioTab,
} from "@/lib/studio/format";
import { AUDIO_TAG_PATTERN, textDirection } from "@/lib/studio/audio-tags";
import type { StudioItem } from "@/lib/studio/types";
import { cn } from "@/lib/utils";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import {
  AudioLinesIcon,
  CornerDownLeftIcon,
  FileAudioIcon,
  FilmIcon,
  ImageIcon,
  LoaderCircleIcon,
  XIcon,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

const TAB_ICONS: Record<StudioTab, typeof ImageIcon> = {
  image: ImageIcon,
  video: FilmIcon,
  speech: AudioLinesIcon,
  transcribe: FileAudioIcon,
};

const SERVICES: Array<{ id: "openrouter" | "google" | "bfl" | "elevenlabs"; name: string; logo: ModelLogoKey }> = [
  { id: "openrouter", name: "OpenRouter", logo: "openrouter" },
  { id: "google", name: "Google AI Studio", logo: "google" },
  { id: "bfl", name: "Black Forest Labs", logo: "bfl" },
  { id: "elevenlabs", name: "ElevenLabs", logo: "elevenlabs" },
];

function useCurrentTab(): StudioTab | null {
  return useRouterState({
    select: (state) => {
      if (!state.location.pathname.startsWith("/studio")) return null;
      const tab = (state.location.search as { tab?: unknown }).tab;
      return isStudioTab(tab) ? tab : "image";
    },
  });
}

/** Latest distinct prompts, newest first (transcripts have none). */
function uniquePrompts(items: StudioItem[], limit: number) {
  const seen = new Set<string>();
  const result: StudioItem[] = [];
  for (const item of items) {
    const key = item.prompt.trim();
    if (!key || item.kind === "transcript" || seen.has(`${item.kind}:${key}`)) continue;
    seen.add(`${item.kind}:${key}`);
    result.push(item);
    if (result.length === limit) break;
  }
  return result;
}

function useNow(intervalMs: number, active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(timer);
  }, [active, intervalMs]);
  return now;
}

function formatElapsed(ms: number) {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes.toLocaleString("fa-IR")}:${rest.toLocaleString("fa-IR", { minimumIntegerDigits: 2 })}`;
}

function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="px-3 pt-4">
      <div className="mb-2 flex h-5 items-center justify-between">
        <h3 className="text-[11px] font-medium text-muted-foreground">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

/** Sidebar shown while in Studio: tools, usage, running work, recents, services. */
export function StudioSidebarNav() {
  const navigate = useNavigate();
  const currentTab = useCurrentTab();
  const { isMobile, setOpenMobile, state } = useSidebar();
  const isIconMode = state === "collapsed" && !isMobile;
  const { items } = useStudioItems();
  const stats = useStudioStats();
  const { hasBusyItems, isLiveRecording } = useSpeech();
  const { connections } = useStudioConnections();
  const openRouterReady = useOpenRouterKeyConfigured();
  const assistant = useStudioAssistantModel();
  const [connectionsOpen, setConnectionsOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  const running = items.filter(isStudioItemBusy);
  const now = useNow(1000, running.length > 0);
  const busyTabs = new Set(running.map((item) => studioKindTab(item.kind)));
  if (hasBusyItems || isLiveRecording) busyTabs.add("transcribe");
  const recent = items
    .filter((item) => (item.kind === "image" || item.kind === "video") && item.status === "done" && item.hasMedia)
    .slice(0, 6);
  const recentPrompts = uniquePrompts(items, 5);
  const todayCount = stats ? Object.values(stats.today).reduce((sum, value) => sum + value, 0) : 0;

  function go(tab: StudioTab, itemId?: string) {
    void navigate({ to: "/studio", search: { tab, item: itemId } });
    if (isMobile) setOpenMobile(false);
  }

  function reusePrompt(item: StudioItem) {
    void navigate({ to: "/studio", search: { tab: studioKindTab(item.kind), prompt: item.prompt } });
    if (isMobile) setOpenMobile(false);
  }

  if (isIconMode) {
    return (
      <SidebarMenu data-studio-tour="tools" className="gap-1 px-2 py-2">
        {STUDIO_TABS.map((tab) => {
          const Icon = TAB_ICONS[tab];
          return (
            <SidebarMenuItem key={tab}>
              <SidebarMenuButton
                tooltip={{ children: STUDIO_TAB_LABELS[tab], side: "left" }}
                isActive={currentTab === tab}
                onClick={() => go(tab)}
              >
                <Icon />
                <span>{STUDIO_TAB_LABELS[tab]}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          );
        })}
      </SidebarMenu>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain">
      {/* Tools */}
      <div data-studio-tour="tools" className="grid grid-cols-2 gap-1.5 px-3 pt-3">
        {STUDIO_TABS.map((tab) => {
          const Icon = TAB_ICONS[tab];
          const active = currentTab === tab;
          const total = stats?.total[studioTabKind(tab)] ?? null;
          return (
            <button
              key={tab}
              type="button"
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative flex h-[4.5rem] flex-col justify-between rounded-xl border p-2.5 text-start transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                active
                  ? "border-foreground/15 bg-background shadow-xs"
                  : "border-transparent bg-sidebar-accent/50 hover:bg-sidebar-accent"
              )}
              onClick={() => go(tab)}
            >
              <span className="flex items-center justify-between">
                <Icon className={cn("size-4", active ? "text-foreground" : "text-muted-foreground")} />
                {busyTabs.has(tab) ? (
                  <LoaderCircleIcon className="size-3.5 animate-spin text-muted-foreground" aria-label="در حال پردازش" />
                ) : total ? (
                  <span className="text-[10px] tabular-nums text-muted-foreground">
                    {total.toLocaleString("fa-IR")}
                  </span>
                ) : null}
              </span>
              <span className={cn("text-[12.5px]", active ? "font-medium" : "text-foreground/80")}>
                {STUDIO_TAB_LABELS[tab]}
              </span>
            </button>
          );
        })}
      </div>

      {/* Usage */}
      {stats && (todayCount > 0 || stats.monthPricedCount > 0) ? (
        <div className="mx-3 mt-3 flex items-center justify-between rounded-xl bg-sidebar-accent/50 px-3 py-2 text-[11px] text-muted-foreground">
          <span>
            امروز{" "}
            <span className="font-medium text-foreground tabular-nums">{todayCount.toLocaleString("fa-IR")}</span>{" "}
            ساخته
          </span>
          {stats.monthPricedCount > 0 ? (
            <span title="هزینه گزارش‌شده توسط سرویس‌ها در این ماه">
              این ماه{" "}
              <span className="font-medium text-foreground tabular-nums" dir="ltr">
                {formatStudioCost(stats.monthCost)}
              </span>
            </span>
          ) : null}
        </div>
      ) : null}

      {/* In progress */}
      {running.length > 0 ? (
        <Section title={`در حال ساخت · ${running.length.toLocaleString("fa-IR")}`}>
          <ul className="flex flex-col gap-1.5">
            {running.slice(0, 5).map((item) => (
              <RunningCard
                key={item.id}
                item={item}
                elapsed={now - item.createdAt}
                onOpen={() => go(studioKindTab(item.kind))}
              />
            ))}
          </ul>
        </Section>
      ) : null}

      {/* Recent */}
      {recent.length > 0 ? (
        <Section
          title="ساخته‌های اخیر"
          action={
            <button
              type="button"
              className="text-[11px] text-muted-foreground transition-colors hover:text-foreground"
              onClick={() => setHistoryOpen(true)}
            >
              همه
            </button>
          }
        >
          <div className="grid grid-cols-3 gap-1.5">
            {recent.map((item) => (
              <button
                key={item.id}
                type="button"
                title={item.title}
                className="group/thumb relative aspect-square overflow-hidden rounded-lg border border-sidebar-border/70 bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => go(studioKindTab(item.kind), item.id)}
              >
                {item.kind === "video" ? (
                  <video src={studioMediaUrl(item)} muted preload="metadata" className="size-full object-cover" />
                ) : (
                  <img src={studioMediaUrl(item)} alt={item.prompt} loading="lazy" className="size-full object-cover" />
                )}
                <span className="absolute inset-0 bg-black/0 transition-colors group-hover/thumb:bg-black/15" />
                {item.kind === "video" ? (
                  <FilmIcon className="absolute end-1 bottom-1 size-3 text-white drop-shadow" />
                ) : null}
              </button>
            ))}
          </div>
        </Section>
      ) : null}

      {/* Recent prompts */}
      {recentPrompts.length > 0 ? (
        <Section title="درخواست‌های اخیر">
          <ul className="flex flex-col">
            {recentPrompts.map((item) => {
              const Icon = TAB_ICONS[studioKindTab(item.kind)];
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    title="استفاده دوباره از این درخواست"
                    className="group/prompt flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-start transition-colors hover:bg-sidebar-accent"
                    onClick={() => reusePrompt(item)}
                  >
                    <Icon className="size-3.5 shrink-0 text-muted-foreground" />
                    <span
                      dir={textDirection(item.prompt)}
                      className="min-w-0 flex-1 truncate text-start text-[12.5px] text-foreground/85"
                    >
                      {item.prompt.replace(AUDIO_TAG_PATTERN, " ").replace(/\s+/g, " ").trim()}
                    </span>
                    <CornerDownLeftIcon className="size-3 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover/prompt:opacity-100" />
                  </button>
                </li>
              );
            })}
          </ul>
        </Section>
      ) : null}

      {/* Assistant model and services, pinned to the bottom */}
      <div className="mt-auto pb-3">
      {assistant.model ? (
        <Section
          title="مدل دستیار"
          action={
            assistant.followsDefault ? null : (
              <button
                type="button"
                className="text-[11px] text-muted-foreground transition-colors hover:text-foreground"
                title="استفاده از مدل پیش‌فرض گفتگو"
                onClick={() => assistant.setModel(null)}
              >
                پیش‌فرض
              </button>
            )
          }
        >
          <ModelPicker
            trigger="row"
            value={assistant.model}
            onValueChange={assistant.setModel}
            heading="مدل دستیار"
            description="برای بهبود درخواست‌ها، برچسب‌های صوتی ElevenLabs و اصلاح رونویسی در استودیو."
            caption={assistant.followsDefault ? "همان مدل گفتگو" : "ویژه استودیو"}
            align="end"
          />
        </Section>
      ) : null}
      <Section title="سرویس‌ها">
        <button
          type="button"
          className="flex w-full items-center gap-2 rounded-xl border border-sidebar-border/70 px-2.5 py-2 text-start transition-colors hover:bg-sidebar-accent/60"
          onClick={() => setConnectionsOpen(true)}
        >
          <span className="flex items-center gap-1.5">
            {SERVICES.map((service) => {
              const connected =
                service.id === "openrouter" ? openRouterReady === true : connections?.[service.id]?.configured === true;
              return (
                <span key={service.id} className="relative" title={`${service.name}: ${connected ? "متصل" : "متصل نیست"}`}>
                  <ModelLogo
                    logo={service.logo}
                    fallback={service.name}
                    className={cn("size-7 rounded-lg", !connected && "opacity-40 grayscale")}
                  />
                  <span
                    className={cn(
                      "absolute -end-0.5 -bottom-0.5 size-2 rounded-full ring-2 ring-sidebar",
                      connected ? "bg-emerald-500" : "bg-muted-foreground/40"
                    )}
                  />
                </span>
              );
            })}
          </span>
          <span className="ms-auto text-[11px] text-muted-foreground">مدیریت</span>
        </button>
      </Section>
      </div>

      <StudioConnectionsDialog open={connectionsOpen} onOpenChange={setConnectionsOpen} />
      <StudioHistorySheet
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        onOpenItem={(item) => go(studioKindTab(item.kind), item.id)}
      />
    </div>
  );
}

function RunningCard({
  item,
  elapsed,
  onOpen,
}: {
  item: StudioItem;
  elapsed: number;
  onOpen: () => void;
}) {
  const visual = item.kind === "image" || item.kind === "video";
  return (
    <li className="group/run relative">
      <button
        type="button"
        className="flex w-full items-center gap-2.5 rounded-xl border border-sidebar-border/70 bg-background/60 p-1.5 pe-8 text-start transition-colors hover:bg-background"
        onClick={onOpen}
      >
        <span className="relative size-9 shrink-0 overflow-hidden rounded-lg bg-muted">
          {visual ? (
            <StudioPixelField cell={3} gap={1} />
          ) : (
            <LoaderCircleIcon className="absolute inset-0 m-auto size-3.5 animate-spin text-muted-foreground" />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span dir="auto" className="block truncate text-[12px]">{item.title}</span>
          <span className="block text-[10.5px] tabular-nums text-muted-foreground">{formatElapsed(elapsed)}</span>
        </span>
      </button>
      <button
        type="button"
        aria-label="لغو"
        title="لغو"
        className="absolute end-1.5 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground group-hover/run:opacity-100 focus-visible:opacity-100"
        onClick={() => void window.desktop.studio.cancel(item.id)}
      >
        <XIcon className="size-3.5" />
      </button>
    </li>
  );
}
