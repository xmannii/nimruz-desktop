"use client";

import { ChangelogEntryCard } from "@/components/changelog-entry-card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getAppChangelog } from "@/lib/app-changelog";
import type { ChangelogEntry } from "@/lib/changelog";
import {
  getLastSeenVersion,
  markVersionSeen,
  resolveWhatsNewEntries,
} from "@/lib/whats-new";
import { useNavigate } from "@tanstack/react-router";
import { SparklesIcon } from "lucide-react";
import { useEffect, useState } from "react";

type WhatsNewDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Installed app version — used to mark the dialog as seen. */
  currentVersion: string;
};

export function WhatsNewDialog({
  open,
  onOpenChange,
  currentVersion,
}: WhatsNewDialogProps) {
  const navigate = useNavigate();
  const [entries, setEntries] = useState<ChangelogEntry[]>([]);

  useEffect(() => {
    let cancelled = false;
    void getLastSeenVersion().then((lastSeen) => {
      if (cancelled) return;
      setEntries(
        resolveWhatsNewEntries(
          currentVersion,
          lastSeen,
          getAppChangelog()
        )
      );
    });
    return () => {
      cancelled = true;
    };
  }, [currentVersion]);

  const title =
    entries.length === 1
      ? `تازه‌های نسخه ${entries[0]!.version}`
      : "تازه‌های این نسخه";

  async function acknowledgeAndClose() {
    await markVersionSeen(currentVersion);
    onOpenChange(false);
  }

  function handleOpenChange(next: boolean) {
    if (!next) {
      void acknowledgeAndClose();
      return;
    }
    onOpenChange(next);
  }

  function handleOpenFullChangelog() {
    void acknowledgeAndClose().then(() => {
      void navigate({ to: "/settings/changelog" });
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        dir="rtl"
        className="flex max-h-[min(85dvh,40rem)] flex-col gap-0 sm:max-w-lg"
        showCloseButton={false}
      >
        <DialogHeader className="gap-3 pb-3">
          <div className="flex items-center gap-2.5">
            <span className="flex size-10 items-center justify-center rounded-2xl bg-muted text-foreground">
              <SparklesIcon className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <DialogTitle>{title}</DialogTitle>
              <DialogDescription className="mt-1">
                این نسخه چی جدید داره 👇
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto py-1 pe-1">
          {entries.length > 0 ? (
            entries.map((entry) => (
              <ChangelogEntryCard
                key={entry.version}
                entry={entry}
                compact
              />
            ))
          ) : (
            <p className="rounded-2xl border border-dashed border-border/70 px-4 py-6 text-center text-sm text-muted-foreground">
              هنوز یادداشت انتشار برای این نسخه ثبت نشده است.
            </p>
          )}
        </div>

        <DialogFooter className="mt-3 gap-2 border-t border-border/60 pt-3 sm:justify-start">
          <Button type="button" onClick={() => void acknowledgeAndClose()}>
            متوجه شدم
          </Button>
          <Button type="button" variant="ghost" onClick={handleOpenFullChangelog}>
            تاریخچه کامل
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
