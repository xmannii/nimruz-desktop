"use client";

import { NimruzLogo } from "@/components/logo";
import { ShenavaDownloadIndicator } from "@/components/speech/shenava-download-indicator";
import { Button } from "@/components/ui/button";
import { SidebarTrigger } from "@/components/ui/sidebar";
import type { WindowState } from "@/lib/desktop-api";
import { APP_NAME_FA } from "@/lib/branding";
import { cn } from "@/lib/utils";
import { MoonIcon, SunIcon, XIcon } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState, type ReactNode } from "react";

function MinimizeWindowIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 12 12"
      aria-hidden
      className={cn("size-4 shrink-0", className)}
    >
      <path
        d="M2.25 6h7.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function MaximizeWindowIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 12 12"
      aria-hidden
      className={cn("size-4 shrink-0", className)}
    >
      <rect
        x="2.25"
        y="2.25"
        width="7.5"
        height="7.5"
        rx="0.75"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      />
    </svg>
  );
}

function RestoreWindowIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 12 12"
      aria-hidden
      className={cn("size-4 shrink-0", className)}
    >
      <path
        d="M4.75 3.25h4.5v4.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <rect
        x="2.25"
        y="4.75"
        width="4.5"
        height="4.5"
        rx="0.75"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      />
    </svg>
  );
}

function useWindowState() {
  const [state, setState] = useState<WindowState>({
    maximized: false,
    fullscreen: false,
  });

  useEffect(() => {
    let cancelled = false;

    void window.desktop.window.getState().then((next) => {
      if (!cancelled) setState(next);
    });

    const unsubscribe = window.desktop.window.onStateChange((next) => {
      setState(next);
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  return state;
}

function TitleBarIconButton({
  label,
  className,
  onClick,
  children,
}: {
  label: string;
  className?: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      className={cn(
        "titlebar-no-drag size-9 rounded-md text-muted-foreground hover:bg-foreground/8 hover:text-foreground [&_svg]:size-[1.125rem]",
        className
      )}
      aria-label={label}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

function ThemeTitleBarButton() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const isDark = mounted && resolvedTheme === "dark";

  return (
    <TitleBarIconButton
      label={isDark ? "تم روشن" : "تم تیره"}
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className={!mounted ? "opacity-50" : undefined}
    >
      {isDark ? <SunIcon /> : <MoonIcon />}
    </TitleBarIconButton>
  );
}

function MacWindowControls() {
  return (
    <div className="titlebar-no-drag flex h-full items-center gap-2 ps-3.5 pe-2">
      <button
        type="button"
        aria-label="بستن"
        className="group relative size-3 rounded-full bg-[#ff5f57] transition hover:brightness-95"
        onClick={() => void window.desktop.window.close()}
      >
        <XIcon className="absolute inset-0 m-auto size-2.5 text-[#4d0002]/80 opacity-0 transition group-hover:opacity-100" />
      </button>
      <button
        type="button"
        aria-label="کوچک‌کردن"
        className="group relative size-3 rounded-full bg-[#febc2e] transition hover:brightness-95"
        onClick={() => void window.desktop.window.minimize()}
      >
        <MinimizeWindowIcon className="absolute inset-0 m-auto size-2.5 text-[#5a4200]/80 opacity-0 transition group-hover:opacity-100" />
      </button>
      <button
        type="button"
        aria-label="بزرگ‌نمایی"
        className="group relative size-3 rounded-full bg-[#28c840] transition hover:brightness-95"
        onClick={() => void window.desktop.window.toggleMaximize()}
      >
        <MaximizeWindowIcon className="absolute inset-0 m-auto size-2.5 text-[#003f0f]/80 opacity-0 transition group-hover:opacity-100" />
      </button>
    </div>
  );
}

function WindowsWindowControls({ maximized }: { maximized: boolean }) {
  return (
    <div className="titlebar-no-drag flex h-full items-stretch">
      <button
        type="button"
        aria-label="کوچک‌کردن"
        className="inline-flex w-11 items-center justify-center text-muted-foreground transition hover:bg-foreground/8 hover:text-foreground"
        onClick={() => void window.desktop.window.minimize()}
      >
        <MinimizeWindowIcon />
      </button>
      <button
        type="button"
        aria-label={maximized ? "بازگرداندن اندازه" : "بزرگ‌نمایی"}
        className="inline-flex w-11 items-center justify-center text-muted-foreground transition hover:bg-foreground/8 hover:text-foreground"
        onClick={() => void window.desktop.window.toggleMaximize()}
      >
        {maximized ? <RestoreWindowIcon /> : <MaximizeWindowIcon />}
      </button>
      <button
        type="button"
        aria-label="بستن"
        className="inline-flex w-11 items-center justify-center text-muted-foreground transition hover:bg-destructive hover:text-destructive-foreground"
        onClick={() => void window.desktop.window.close()}
      >
        <XIcon className="size-[1.125rem]" />
      </button>
    </div>
  );
}

export function DesktopTitleBar() {
  const platform = window.desktop.platform;
  const isMac = platform === "darwin";
  const { maximized } = useWindowState();

  return (
    <header
      dir="ltr"
      className="flex h-14 w-full shrink-0 items-stretch border-b border-sidebar-border bg-sidebar/90 backdrop-blur-md"
    >
      {isMac ? <MacWindowControls /> : null}

      <div
        className="titlebar-drag flex min-w-0 flex-1 items-center justify-between"
        onDoubleClick={() => void window.desktop.window.toggleMaximize()}
      >
        <div className="flex min-w-0 items-center gap-2.5 px-3">
          <NimruzLogo
            className="titlebar-no-drag size-6 shrink-0 text-sidebar-foreground"
            aria-hidden
          />
          <span className="truncate text-sm font-medium tracking-tight text-sidebar-foreground">
            {APP_NAME_FA}
          </span>
        </div>

        <div className="titlebar-no-drag flex h-full items-center gap-1 pe-1.5">
          <ShenavaDownloadIndicator />
          <ThemeTitleBarButton />
          <SidebarTrigger
            aria-label="باز و بسته کردن نوار کناری"
            className="titlebar-no-drag size-9 rounded-md text-muted-foreground hover:bg-foreground/8 hover:text-foreground [&_svg]:size-[1.125rem]"
          />
          {!isMac ? <WindowsWindowControls maximized={maximized} /> : null}
        </div>
      </div>
    </header>
  );
}
