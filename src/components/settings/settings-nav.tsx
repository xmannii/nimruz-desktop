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
  BrainIcon,
  BotIcon,
  CpuIcon,
  InfoIcon,
  PaletteIcon,
  SparklesIcon,
  UserRoundIcon,
  type LucideIcon,
} from "lucide-react";

export const SETTINGS_NAV: Array<{
  to:
    | "/settings"
    | "/settings/memories"
    | "/settings/experts"
    | "/settings/models"
    | "/settings/skills"
    | "/settings/appearance"
    | "/settings/about";
  label: string;
  icon: LucideIcon;
  match: (pathname: string) => boolean;
  badgeKey?: "memories";
}> = [
  {
    to: "/settings",
    label: "شخصی‌سازی",
    icon: UserRoundIcon,
    match: (pathname) =>
      pathname === "/settings" || pathname === "/settings/",
  },
  {
    to: "/settings/models",
    label: "مدل‌ها",
    icon: CpuIcon,
    match: (pathname) => pathname.startsWith("/settings/models"),
  },
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
  {
    to: "/settings/appearance",
    label: "ظاهر",
    icon: PaletteIcon,
    match: (pathname) => pathname.startsWith("/settings/appearance"),
  },
  {
    to: "/settings/about",
    label: "درباره",
    icon: InfoIcon,
    match: (pathname) => pathname.startsWith("/settings/about"),
  },
];

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
      <SidebarGroupContent className="min-h-0 flex-1 overflow-y-auto">
        <SidebarMenu className="gap-0.5">
          {SETTINGS_NAV.map((item) => {
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
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
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
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
