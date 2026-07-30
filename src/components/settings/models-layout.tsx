"use client";

import { Outlet } from "@tanstack/react-router";

export function ModelsSettingsLayout() {
  return (
    <div className="flex flex-col gap-6" dir="rtl">
      <div>
        <h2 className="text-lg font-medium tracking-tight text-foreground">
          مدل‌ها و اتصال‌ها
        </h2>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">
          روش اتصال، مدل‌های قابل استفاده و ارائه‌دهنده‌ها را جداگانه مدیریت
          کنید.
        </p>
      </div>

      <Outlet />
    </div>
  );
}
