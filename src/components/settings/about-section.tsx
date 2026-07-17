"use client";

import { useAppShell } from "@/components/app-shell-context";
import { SettingsSection } from "@/components/settings/settings-section";
import { Button } from "@/components/ui/button";
import { APP_NAME_FA, GITHUB_RELEASES_URL } from "@/lib/branding";
import type { UpdateCheckResult } from "@/lib/updates";
import { Link } from "@tanstack/react-router";
import {
  BookOpenIcon,
  ExternalLinkIcon,
  InfoIcon,
  RefreshCwIcon,
  ScrollTextIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

async function runUpdateCheck(): Promise<UpdateCheckResult> {
  return window.desktop.updates.check();
}

export function AboutSettingsSection() {
  const { openOnboarding } = useAppShell();
  const [version, setVersion] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void window.desktop.updates.getVersion().then((next) => {
      if (!cancelled) setVersion(next);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleCheck() {
    setChecking(true);
    try {
      const result = await runUpdateCheck();

      if (result.status === "available") {
        toast.message(`نسخه ${result.latestVersion} آماده است`, {
          description: "می‌توانید فایل نصب را از صفحه انتشار دانلود کنید.",
          action: {
            label: "دانلود",
            onClick: () => {
              void window.desktop.updates.openUrl(
                result.downloadUrl ?? result.releaseUrl
              );
            },
          },
        });
        return;
      }

      if (result.status === "up-to-date") {
        toast.success("برنامه به‌روز است", {
          description: `نسخه فعلی: ${result.currentVersion}`,
        });
        return;
      }

      toast.error("بررسی به‌روزرسانی ناموفق بود", {
        description: result.message,
      });
    } catch {
      toast.error("بررسی به‌روزرسانی ناموفق بود");
    } finally {
      setChecking(false);
    }
  }

  return (
    <SettingsSection
      title="درباره"
      description={`${APP_NAME_FA} یک برنامه متن‌باز است. به‌روزرسانی‌ها از گیت‌هاب منتشر می‌شوند.`}
      icon={InfoIcon}
    >
      <div className="rounded-2xl border border-border/70 bg-muted/20 px-4 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">نسخه نصب‌شده</p>
            <p className="mt-1 font-mono text-sm text-muted-foreground tabular-nums" dir="ltr">
              {version ?? "…"}
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5"
            disabled={checking}
            onClick={() => void handleCheck()}
          >
            <RefreshCwIcon
              className={`size-3.5 ${checking ? "animate-spin" : ""}`}
            />
            {checking ? "در حال بررسی…" : "بررسی به‌روزرسانی"}
          </Button>
        </div>

        <div className="mt-4 flex flex-col gap-2 border-t border-border/60 pt-4">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-auto justify-start gap-1.5 px-0 text-muted-foreground hover:bg-transparent hover:text-foreground"
            render={<Link to="/settings/changelog" />}
          >
            <ScrollTextIcon className="size-3.5" />
            تغییرات نسخه‌ها
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-auto justify-start gap-1.5 px-0 text-muted-foreground hover:bg-transparent hover:text-foreground"
            render={<Link to="/settings/help" />}
          >
            <BookOpenIcon className="size-3.5" />
            راهنمای کامل برنامه
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-auto justify-start gap-1.5 px-0 text-muted-foreground hover:bg-transparent hover:text-foreground"
            onClick={openOnboarding}
          >
            <BookOpenIcon className="size-3.5" />
            نمایش مجدد تور شروع
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-auto justify-start gap-1.5 px-0 text-muted-foreground hover:bg-transparent hover:text-foreground"
            onClick={() => {
              void window.desktop.updates.openUrl(GITHUB_RELEASES_URL);
            }}
          >
            <ExternalLinkIcon className="size-3.5" />
            مشاهده انتشارها در گیت‌هاب
          </Button>
        </div>
      </div>
    </SettingsSection>
  );
}
