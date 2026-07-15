"use client";

import { useAppShell } from "@/components/app-shell-context";
import { SettingsNav } from "@/components/settings/settings-nav";
import { Button } from "@/components/ui/button";
import { Outlet, useNavigate } from "@tanstack/react-router";
import { ArrowRightIcon } from "lucide-react";

export function SettingsLayout() {
  const navigate = useNavigate();
  const { memories, activeChatId, personalizationSaveState } = useAppShell();

  function handleBack() {
    if (activeChatId) {
      void navigate({
        to: "/chat/$chatId",
        params: { chatId: activeChatId },
      });
      return;
    }
    void navigate({ to: "/" });
  }

  const saveLabel =
    personalizationSaveState === "saving"
      ? "در حال ذخیره…"
      : personalizationSaveState === "saved"
        ? "ذخیره شد"
        : personalizationSaveState === "error"
          ? "خطا در ذخیره"
          : null;

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <header
        dir="rtl"
        className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-6"
      >
        <div className="min-w-0">
          <h1 className="text-lg font-medium tracking-tight text-foreground">
            تنظیمات
          </h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            داده‌ها فقط روی این دستگاه ذخیره می‌شوند.
            {saveLabel ? (
              <span
                className={
                  personalizationSaveState === "error"
                    ? " text-destructive"
                    : " text-foreground/80"
                }
              >
                {" · "}
                {saveLabel}
              </span>
            ) : null}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="shrink-0 gap-1.5"
          onClick={handleBack}
        >
          <ArrowRightIcon className="size-3.5" />
          بازگشت به گفتگو
        </Button>
      </header>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <aside className="w-52 shrink-0 border-e border-border bg-muted/15 sm:w-56">
          <SettingsNav memoryCount={memories.length} />
        </aside>
        <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain">
          <div className="mx-auto w-full max-w-2xl px-4 py-6 sm:px-8 sm:py-8">
            <Outlet />
          </div>
        </div>
      </div>
    </div>
  );
}
