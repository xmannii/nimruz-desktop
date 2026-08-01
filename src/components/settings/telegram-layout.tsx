"use client";

import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Outlet, useNavigate, useRouterState } from "@tanstack/react-router";

type TelegramSetupStep = "overview" | "pairing" | "connection" | "runtime";

const TELEGRAM_STEP_PATHS = {
  overview: "/settings/telegram",
  pairing: "/settings/telegram/pairing",
  connection: "/settings/telegram/connection",
  runtime: "/settings/telegram/runtime",
} as const;

export function TelegramSettingsLayout() {
  const navigate = useNavigate();
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const activeStep: TelegramSetupStep = pathname.endsWith("/pairing")
    ? "pairing"
    : pathname.endsWith("/connection")
      ? "connection"
      : pathname.endsWith("/runtime")
        ? "runtime"
        : "overview";

  return (
    <div className="flex flex-col gap-6" dir="rtl">
      <div>
        <h2 className="text-lg font-medium tracking-tight text-foreground">
          دستیار تلگرام
        </h2>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">
          ربات، حساب جفت‌شده، مسیر شبکه و شیوهٔ اجرای راه‌دور را جداگانه مدیریت
          کنید.
        </p>
      </div>

      <Tabs
        value={activeStep}
        onValueChange={(value) => {
          const next = TELEGRAM_STEP_PATHS[value as TelegramSetupStep];
          if (next) void navigate({ to: next });
        }}
      >
        <div className="flex flex-col gap-2">
          <p className="text-xs font-medium text-muted-foreground">
            مسیر راه‌اندازی
          </p>
          <TabsList className="grid h-auto w-full grid-cols-2 rounded-2xl sm:grid-cols-4">
            <TabsTrigger value="overview">۱. تنظیم ربات</TabsTrigger>
            <TabsTrigger value="pairing">۲. جفت‌سازی</TabsTrigger>
            <TabsTrigger value="connection">۳. شبکه</TabsTrigger>
            <TabsTrigger value="runtime">۴. امنیت</TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value={activeStep}>
          <Outlet />
        </TabsContent>
      </Tabs>
    </div>
  );
}
