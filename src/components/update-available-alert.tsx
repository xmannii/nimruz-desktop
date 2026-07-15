"use client";

import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { AvailableUpdate } from "@/hooks/use-app-update";
import { DownloadIcon } from "lucide-react";

type UpdateAvailableAlertProps = {
  update: AvailableUpdate;
  onDownload: () => void;
  onDismiss: () => void;
};

export function UpdateAvailableAlert({
  update,
  onDownload,
  onDismiss,
}: UpdateAvailableAlertProps) {
  return (
    <div className="shrink-0 border-b border-border px-3 py-3 sm:px-6">
      <Alert
        dir="rtl"
        className="mx-auto max-w-3xl border-sky-500/35 bg-sky-500/10 pe-28 text-sky-950 dark:text-sky-50"
      >
        <DownloadIcon />
        <AlertTitle>
          نسخه {update.latestVersion} آماده است
        </AlertTitle>
        <AlertDescription>
          نسخه فعلی شما {update.currentVersion} است. برای دریافت به‌روزرسانی، فایل
          نصب را از گیت‌هاب دانلود کنید.
        </AlertDescription>
        <AlertAction className="flex flex-col items-stretch gap-1.5 sm:items-end">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="border-sky-500/45 bg-background/80"
            onClick={onDownload}
          >
            دریافت به‌روزرسانی
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 text-sky-950/70 hover:bg-sky-500/15 hover:text-sky-950 dark:text-sky-50/70 dark:hover:text-sky-50"
            onClick={onDismiss}
          >
            بعداً
          </Button>
        </AlertAction>
      </Alert>
    </div>
  );
}
