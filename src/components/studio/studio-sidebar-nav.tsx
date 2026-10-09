"use client";

import { useSpeech } from "@/components/speech/speech-provider";
import { ModelLogo } from "@/components/studio/model-logo";
import { StudioConnectionsDialog } from "@/components/studio/studio-connections-dialog";
import { useOpenRouterKeyConfigured } from "@/components/studio/studio-key-notice";
import { StudioPixelField } from "@/components/studio/studio-pixel-field";
import { SidebarSection } from "@/components/chat/sidebar/sidebar-section";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { useStudioConnections } from "@/hooks/use-studio-connections";
import { useStudioItems } from "@/hooks/use-studio-items";
import {
  formatRelativeTime,
  isStudioItemBusy,
  isStudioTab,
  STUDIO_KIND_LABELS,
  STUDIO_TAB_LABELS,
  STUDIO_TABS,
  studioKindTab,
  studioMediaUrl,
  type StudioTab,
} from "@/lib/studio/format";
import type { ModelLogoKey } from "@/components/studio/model-logos.data";
import type { StudioItem } from "@/lib/studio/types";
import { cn } from "@/lib/utils";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import {
  AudioLinesIcon,
  FileAudioIcon,
  FilmIcon,
  ImageIcon,
  LoaderCircleIcon,
  SettingsIcon,
} from "lucide-react";
import { useState } from "react";

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

/** Sidebar shown while in Studio: sections, running work, recents, services. */
export function StudioSidebarNav() {
  const navigate = useNavigate();
  const currentTab = useCurrentTab();
  const { isMobile, setOpenMobile, state } = useSidebar();
  const isIconMode = state === "collapsed" && !isMobile;
  const { items } = useStudioItems();
  const { hasBusyItems, isLiveRecording } = useSpeech();
  const { connections } = useStudioConnections();
  const openRouterReady = useOpenRouterKeyConfigured();
  const [connectionsOpen, setConnectionsOpen] = useState(false);

  const running = items.filter(isStudioItemBusy);
  const busyTabs = new Set(running.map((item) => studioKindTab(item.kind)));
  if (hasBusyItems || isLiveRecording) busyTabs.add("transcribe");
  const recent = items
    .filter((item) => (item.kind === "image" || item.kind === "video") && item.status === "done" && item.hasMedia)
    .slice(0, 9);

  function go(tab: StudioTab, itemId?: string) {
    void navigate({ to: "/studio", search: { tab, item: itemId } });
    if (isMobile) setOpenMobile(false);
  }

  const sections = (
    <SidebarMenu className="gap-0.5">
      {STUDIO_TABS.map((tab) => {
        const Icon = TAB_ICONS[tab];
        return (
          <SidebarMenuItem key={tab}>
            <SidebarMenuButton
              tooltip={{ children: STUDIO_TAB_LABELS[tab], side: "left" }}
              isActive={currentTab === tab}
              className="h-8 text-[13px]"
              onClick={() => go(tab)}
            >
              <Icon />
              <span className="flex-1 text-start">{STUDIO_TAB_LABELS[tab]}</span>
              {busyTabs.has(tab) ? (
                <LoaderCircleIcon className="size-3.5 animate-spin text-muted-foreground" aria-label="در حال پردازش" />
              ) : null}
            </SidebarMenuButton>
          </SidebarMenuItem>
        );
      })}
    </SidebarMenu>
  );

  if (isIconMode) {
    return <div className="px-2 py-2">{sections}</div>;
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-3">
      <SidebarSection title="استودیو" className="pt-2">
        {sections}
      </SidebarSection>

      {running.length > 0 ? (
        <SidebarSection title="در حال ساخت" count={running.length}>
          <ul className="flex flex-col gap-0.5">
            {running.slice(0, 6).map((item) => (
              <RunningRow key={item.id} item={item} onOpen={() => go(studioKindTab(item.kind))} />
            ))}
          </ul>
        </SidebarSection>
      ) : null}

      {recent.length > 0 ? (
        <SidebarSection title="ساخته‌های اخیر">
          <div className="grid grid-cols-3 gap-1.5 px-1">
            {recent.map((item) => (
              <button
                key={item.id}
                type="button"
                title={item.title}
                className="aspect-square overflow-hidden rounded-lg border border-sidebar-border/70 bg-muted transition-opacity hover:opacity-85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => go(studioKindTab(item.kind), item.id)}
              >
                {item.kind === "video" ? (
                  <video src={studioMediaUrl(item)} muted preload="metadata" className="size-full object-cover" />
                ) : (
                  <img src={studioMediaUrl(item)} alt={item.prompt} loading="lazy" className="size-full object-cover" />
                )}
              </button>
            ))}
          </div>
        </SidebarSection>
      ) : null}

      <SidebarSection
        title="سرویس‌ها"
        action={
          <button
            type="button"
            className="flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
            aria-label="مدیریت سرویس‌ها"
            title="مدیریت سرویس‌ها"
            onClick={() => setConnectionsOpen(true)}
          >
            <SettingsIcon className="size-3.5" />
          </button>
        }
      >
        <ul className="flex flex-col gap-0.5">
          {SERVICES.map((service) => {
            const connected =
              service.id === "openrouter" ? openRouterReady === true : connections?.[service.id]?.configured === true;
            return (
              <li key={service.id}>
                <button
                  type="button"
                  className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-start text-[13px] transition-colors hover:bg-sidebar-accent"
                  onClick={() =>
                    service.id === "openrouter"
                      ? void navigate({ to: "/settings/models/providers", search: { provider: "openrouter" } })
                      : setConnectionsOpen(true)
                  }
                >
                  <ModelLogo logo={service.logo} fallback={service.name} tile={false} className="size-4" />
                  <span className="min-w-0 flex-1 truncate" dir="ltr">{service.name}</span>
                  <span
                    className={cn(
                      "text-[11px]",
                      connected ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"
                    )}
                  >
                    {connected ? "متصل" : "اتصال"}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </SidebarSection>

      <StudioConnectionsDialog open={connectionsOpen} onOpenChange={setConnectionsOpen} />
    </div>
  );
}

function RunningRow({ item, onOpen }: { item: StudioItem; onOpen: () => void }) {
  return (
    <li>
      <button
        type="button"
        className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-start transition-colors hover:bg-sidebar-accent"
        onClick={onOpen}
      >
        <span className="relative size-8 shrink-0 overflow-hidden rounded-md border border-sidebar-border/70 bg-muted">
          {item.kind === "image" || item.kind === "video" ? (
            <StudioPixelField cell={3} gap={1} />
          ) : (
            <LoaderCircleIcon className="absolute inset-0 m-auto size-3.5 animate-spin text-muted-foreground" />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span dir="auto" className="block truncate text-[12.5px]">{item.title}</span>
          <span className="block text-[11px] text-muted-foreground">
            {STUDIO_KIND_LABELS[item.kind]} · {formatRelativeTime(item.createdAt)}
          </span>
        </span>
      </button>
    </li>
  );
}
