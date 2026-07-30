"use client";

import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarSeparator,
  useSidebar,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  BellRingIcon,
  BrainIcon,
  BotIcon,
  ChevronDownIcon,
  CircleHelpIcon,
  CpuIcon,
  InfoIcon,
  Mic2Icon,
  PanelTopOpenIcon,
  PaletteIcon,
  PlusIcon,
  SearchIcon,
  ScrollTextIcon,
  SparklesIcon,
  UserRoundIcon,
  WaypointsIcon,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useState } from "react";

type SettingsPath =
  | "/settings"
  | "/settings/memories"
  | "/settings/experts"
  | "/settings/models"
  | "/settings/models/add"
  | "/settings/models/active"
  | "/settings/models/providers"
  | "/settings/notifications"
  | "/settings/speech"
  | "/settings/companion"
  | "/settings/research-agents"
  | "/settings/skills"
  | "/settings/mcp"
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
  children?: SettingsNavItem[];
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
        match: (pathname) =>
          pathname === "/settings/models" || pathname === "/settings/models/",
        children: [
          {
            to: "/settings/models/add",
            label: "افزودن مدل",
            icon: PlusIcon,
            match: (pathname) =>
              pathname.startsWith("/settings/models/add"),
          },
          {
            to: "/settings/models/active",
            label: "مدل‌های فعال",
            icon: BotIcon,
            match: (pathname) =>
              pathname.startsWith("/settings/models/active"),
          },
          {
            to: "/settings/models/providers",
            label: "ارائه‌دهنده‌ها",
            icon: WaypointsIcon,
            match: (pathname) =>
              pathname.startsWith("/settings/models/providers"),
          },
        ],
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
        to: "/settings/mcp",
        label: "سرورهای MCP",
        icon: WaypointsIcon,
        match: (pathname) => pathname.startsWith("/settings/mcp"),
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

export const SETTINGS_NAV = SETTINGS_NAV_GROUPS.flatMap((group) =>
  group.items.flatMap((item) => [item, ...(item.children ?? [])])
);

function itemOrChildMatches(
  item: SettingsNavItem,
  pathname: string
): boolean {
  return (
    item.match(pathname) ||
    item.children?.some((child) => itemOrChildMatches(child, pathname)) === true
  );
}

function SettingsNavItemRow({
  item,
  pathname,
  memoryCount,
  isIconMode,
  onNavigate,
}: {
  item: SettingsNavItem;
  pathname: string;
  memoryCount: number;
  isIconMode: boolean;
  onNavigate: () => void;
}) {
  const active = item.match(pathname);
  const hasActiveChild =
    item.children?.some((child) => itemOrChildMatches(child, pathname)) ?? false;
  const [open, setOpen] = useState(
    Boolean(item.children?.length) || active || hasActiveChild
  );
  const Icon = item.icon;

  useEffect(() => {
    if (active || hasActiveChild) setOpen(true);
  }, [active, hasActiveChild]);

  const menuButton = (
    <SidebarMenuButton
      isActive={active}
      tooltip={{ children: item.label, side: "left" }}
      className={cn(
        !isIconMode &&
          "h-9 text-sidebar-foreground/80 hover:text-sidebar-foreground"
      )}
      render={<Link to={item.to} onClick={onNavigate} />}
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
  );

  if (!item.children?.length) {
    return <SidebarMenuItem>{menuButton}</SidebarMenuItem>;
  }

  return (
    <Collapsible
      open={!isIconMode && open}
      onOpenChange={setOpen}
      render={<SidebarMenuItem />}
    >
      {menuButton}
      <CollapsibleTrigger
        render={
          <SidebarMenuAction
            aria-label={open ? `بستن ${item.label}` : `باز کردن ${item.label}`}
            title={open ? "بستن زیرصفحه‌ها" : "نمایش زیرصفحه‌ها"}
          />
        }
      >
        <ChevronDownIcon
          aria-hidden
          className={cn(
            "transition-transform motion-reduce:transition-none",
            open && "rotate-180"
          )}
        />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <SidebarMenuSub className="max-w-full translate-x-0 rtl:translate-x-0">
          {item.children.map((child) => {
            const ChildIcon = child.icon;

            return (
              <SidebarMenuSubItem key={child.to}>
                <SidebarMenuSubButton
                  isActive={child.match(pathname)}
                  render={<Link to={child.to} onClick={onNavigate} />}
                >
                  <ChildIcon />
                  <span>{child.label}</span>
                </SidebarMenuSubButton>
              </SidebarMenuSubItem>
            );
          })}
        </SidebarMenuSub>
      </CollapsibleContent>
    </Collapsible>
  );
}

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
      <SidebarGroupContent className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto pb-2">
        {SETTINGS_NAV_GROUPS.map((group, index) => (
          <SidebarGroup key={group.id} className="px-0 py-1">
            {index > 0 && !isIconMode ? (
              <SidebarSeparator className="mb-1.5 opacity-60" />
            ) : null}
            {!isIconMode ? (
              <SidebarGroupLabel className="h-7 px-3 text-[10px] font-semibold tracking-wide text-muted-foreground/80">
                {group.label}
              </SidebarGroupLabel>
            ) : null}
            <SidebarGroupContent>
              <SidebarMenu className="gap-0.5">
                {group.items.map((item) => (
                  <SettingsNavItemRow
                    key={item.to}
                    item={item}
                    pathname={pathname}
                    memoryCount={memoryCount}
                    isIconMode={isIconMode}
                    onNavigate={closeMobileSidebar}
                  />
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
