"use client";

import { Badge } from "@/components/ui/badge";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  BellRingIcon,
  BrainIcon,
  BotIcon,
  CircleHelpIcon,
  CpuIcon,
  InfoIcon,
  Mic2Icon,
  PanelTopOpenIcon,
  PaletteIcon,
  SearchIcon,
  ScrollTextIcon,
  SparklesIcon,
  UserRoundIcon,
  type LucideIcon,
} from "lucide-react";

type SettingsPath =
  | "/settings"
  | "/settings/memories"
  | "/settings/experts"
  | "/settings/models"
  | "/settings/notifications"
  | "/settings/speech"
  | "/settings/companion"
  | "/settings/research-agents"
  | "/settings/skills"
  | "/settings/appearance"
  | "/settings/changelog"
  | "/settings/help"
  | "/settings/about";

type SettingsNavItem = {
  to:
    SettingsPath;
  label: string;
  icon: LucideIcon;
  match: (pathname: string) => boolean;
  badgeKey?: "memories";
};

export const SETTINGS_NAV_GROUPS: Array<{
  id: string;
  label: string;
  items: SettingsNavItem[];
}> = [
  {
    id: "personal",
    label: "شخصی‌سازی",
    items: [
      {
        to: "/settings",
        label: "شخصی‌سازی",
        icon: UserRoundIcon,
        match: (pathname) =>
          pathname === "/settings" || pathname === "/settings/",
      },
      {
        to: "/settings/appearance",
        label: "ظاهر",
        icon: PaletteIcon,
        match: (pathname) => pathname.startsWith("/settings/appearance"),
      },
      {
        to: "/settings/notifications",
        label: "اعلان‌ها و صدا",
        icon: BellRingIcon,
        match: (pathname) => pathname.startsWith("/settings/notifications"),
      },
    ],
  },
  {
    id: "assistant",
    label: "دستیار و مدل‌ها",
    items: [
      {
        to: "/settings/companion",
        label: "دستیار سریع",
        icon: PanelTopOpenIcon,
        match: (pathname) => pathname.startsWith("/settings/companion"),
      },
      {
        to: "/settings/models",
        label: "مدل‌ها",
        icon: CpuIcon,
        match: (pathname) => pathname.startsWith("/settings/models"),
      },
      {
        to: "/settings/speech",
        label: "گفتار",
        icon: Mic2Icon,
        match: (pathname) => pathname.startsWith("/settings/speech"),
      },
      {
        to: "/settings/research-agents",
        label: "دستیارهای پژوهشی",
        icon: SearchIcon,
        match: (pathname) => pathname.startsWith("/settings/research-agents"),
      },
    ],
  },
  {
    id: "knowledge",
    label: "دانش و ابزارها",
    items: [
      {
        to: "/settings/memories",
        label: "خاطره‌ها",
        icon: BrainIcon,
        match: (pathname) => pathname.startsWith("/settings/memories"),
        badgeKey: "memories",
      },
      {
        to: "/settings/skills",
        label: "مهارت‌ها",
        icon: SparklesIcon,
        match: (pathname) => pathname.startsWith("/settings/skills"),
      },
      {
        to: "/settings/experts",
        label: "متخصص‌ها",
        icon: BotIcon,
        match: (pathname) => pathname.startsWith("/settings/experts"),
      },
    ],
  },
  {
    id: "app",
    label: "برنامه و راهنما",
    items: [
      {
        to: "/settings/changelog",
        label: "تغییرات نسخه‌ها",
        icon: ScrollTextIcon,
        match: (pathname) => pathname.startsWith("/settings/changelog"),
      },
      {
        to: "/settings/help",
        label: "راهنما",
        icon: CircleHelpIcon,
        match: (pathname) => pathname.startsWith("/settings/help"),
      },
      {
        to: "/settings/about",
        label: "درباره",
        icon: InfoIcon,
        match: (pathname) => pathname.startsWith("/settings/about"),
      },
    ],
  },
];

export const SETTINGS_NAV = SETTINGS_NAV_GROUPS.flatMap((group) => group.items);

export function SettingsSidebarNav({ memoryCount = 0 }: { memoryCount?: number }) {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const { isMobile, setOpenMobile, state } = useSidebar();
  const isIconMode = state === "collapsed" && !isMobile;

  function closeMobileSidebar() {
    if (isMobile) setOpenMobile(false);
  }

  return (
    <SidebarGroup className="flex min-h-0 flex-1 flex-col pt-2">
      {!isIconMode ? (
        <SidebarGroupLabel className="mb-1 h-7 px-2 text-[11px] font-medium tracking-wide text-muted-foreground">
          تنظیمات
        </SidebarGroupLabel>
      ) : null}
      <SidebarGroupContent className="min-h-0 flex-1 overflow-y-auto pb-2">
        {SETTINGS_NAV_GROUPS.map((group) => (
          <SidebarGroup key={group.id} className="px-0 py-0.5">
            {!isIconMode ? (
              <SidebarGroupLabel className="h-7 px-2 text-[11px] font-medium tracking-wide text-muted-foreground">
                {group.label}
              </SidebarGroupLabel>
            ) : null}
            <SidebarMenu className="gap-0.5">
              {group.items.map((item) => {
                const active = item.match(pathname);
                const Icon = item.icon;

                return (
                  <SidebarMenuItem key={item.to}>
                    <SidebarMenuButton
                      isActive={active}
                      tooltip={{ children: item.label, side: "left" }}
                      className={
                        isIconMode
                          ? undefined
                          : "h-9 text-sidebar-foreground/80 hover:text-sidebar-foreground"
                      }
                      render={
                        <Link to={item.to} onClick={closeMobileSidebar} />
                      }
                    >
                      <Icon />
                      <span className="min-w-0 flex-1 truncate">
                        {item.label}
                      </span>
                      {item.badgeKey === "memories" && memoryCount > 0 ? (
                        <Badge
                          variant="secondary"
                          className="ms-auto h-5 min-w-5 justify-center rounded-md px-1.5 text-[10px] font-normal leading-none group-data-[collapsible=icon]:hidden"
                        >
                          {memoryCount.toLocaleString("fa-IR")}
                        </Badge>
                      ) : null}
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroup>
        ))}
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
