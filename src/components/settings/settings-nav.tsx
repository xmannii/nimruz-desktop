"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  BrainIcon,
  CpuIcon,
  PaletteIcon,
  UserRoundIcon,
  type LucideIcon,
} from "lucide-react";

const SETTINGS_NAV: Array<{
  to:
    | "/settings"
    | "/settings/memories"
    | "/settings/models"
    | "/settings/appearance";
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
    to: "/settings/appearance",
    label: "ظاهر",
    icon: PaletteIcon,
    match: (pathname) => pathname.startsWith("/settings/appearance"),
  },
];

export function SettingsNav({ memoryCount = 0 }: { memoryCount?: number }) {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });

  return (
    <nav dir="rtl" className="flex flex-col gap-1 p-2">
      {SETTINGS_NAV.map((item) => {
        const active = item.match(pathname);
        const Icon = item.icon;

        return (
          <Link
            key={item.to}
            to={item.to}
            className={cn(
              "flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm transition-colors",
              active
                ? "bg-muted font-medium text-foreground"
                : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
            )}
          >
            <Icon className="size-4 shrink-0" />
            <span className="min-w-0 flex-1 truncate">{item.label}</span>
            {item.badgeKey === "memories" && memoryCount > 0 ? (
              <Badge
                variant="secondary"
                className="h-5 min-w-5 px-1.5 text-[10px] leading-none"
              >
                {memoryCount.toLocaleString("fa-IR")}
              </Badge>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
