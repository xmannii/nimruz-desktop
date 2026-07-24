"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import type {
  CheckpointFileDiff,
  TurnCheckpointDiff,
} from "@/lib/workspace";
import {
  FileDiffIcon,
  RotateCcwIcon,
  ShieldCheckIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

const STATUS_LABEL: Record<CheckpointFileDiff["status"], string> = {
  added: "افزوده",
  modified: "ویرایش",
  deleted: "حذف",
  renamed: "تغییر نام",
  copied: "کپی",
  binary: "دودویی",
};

/**
 * Turn-level Git checkpoint summary rendered beside the assistant response.
 * The before/after refs are immutable; the restore action is separately
 * guarded by the main process against overwriting newer workspace changes.
 */
export function ChatTurnCheckpoint({ runId }: { runId: string }) {
  const [diff, setDiff] = useState<TurnCheckpointDiff | null>(null);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let timer = 0;
    let attempts = 0;
    const load = async () => {
      try {
        const result =
          await window.desktop.storage.getTurnCheckpointDiff(runId);
        if (cancelled) return;
        if (result) {
          setDiff(result);
          setSelectedPath(
            (current) => current ?? result.files[0]?.path ?? null
          );
          return;
        }
      } catch {
        // A run without a Git checkpoint is expected for non-Git workspaces.
        return;
      }
      // Stream completion and checkpoint finalization can cross by a few
      // milliseconds. Retry briefly instead of requiring a page refresh.
      attempts += 1;
      if (attempts < 5) timer = window.setTimeout(load, attempts * 200);
    };
    void load();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [runId]);

  if (!diff) return null;
  const selected =
    diff.files.find((file) => file.path === selectedPath) ?? diff.files[0];
  const hasChanges = diff.checkpoint.filesChanged > 0;

  async function restore() {
    if (restoring) return;
    setRestoring(true);
    try {
      await window.desktop.storage.restoreTurnCheckpoint(runId);
      toast.success("تغییرهای این نوبت با موفقیت بازگردانی شد.");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "بازگردانی چک‌پوینت ناموفق بود."
      );
    } finally {
      setRestoring(false);
    }
  }

  return (
    <div
      dir="rtl"
      className="mt-2 flex flex-wrap items-center gap-1.5 rounded-lg border border-border/60 bg-muted/25 px-2 py-1.5 text-[11px]"
    >
      <ShieldCheckIcon className="size-3.5 text-primary" />
      <span className="font-medium">چک‌پوینت نوبت</span>
      <span className="text-muted-foreground">
        {hasChanges
          ? `${diff.checkpoint.filesChanged.toLocaleString("fa-IR")} فایل`
          : "بدون تغییر فایل"}
      </span>
      {diff.checkpoint.additions > 0 ? (
        <span dir="ltr" className="font-mono text-primary">
          +{diff.checkpoint.additions}
        </span>
      ) : null}
      {diff.checkpoint.deletions > 0 ? (
        <span dir="ltr" className="font-mono text-destructive">
          -{diff.checkpoint.deletions}
        </span>
      ) : null}

      {hasChanges ? (
        <>
          <Dialog>
            <DialogTrigger
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  className="me-auto h-6 gap-1 px-2 text-[10px]"
                >
                  <FileDiffIcon className="size-3" />
                  مشاهده دیف
                </Button>
              }
            />
            <DialogContent
              dir="rtl"
              className="flex h-[min(80vh,760px)] max-w-[min(94vw,1000px)] flex-col gap-3 p-4 sm:max-w-[min(94vw,1000px)]"
            >
              <DialogHeader>
                <DialogTitle>تغییرهای این نوبت</DialogTitle>
              </DialogHeader>
              <div className="grid min-h-0 flex-1 grid-cols-[minmax(180px,0.3fr)_minmax(0,1fr)] overflow-hidden rounded-xl border">
                <ScrollArea className="min-h-0 border-l">
                  <div className="flex flex-col p-1.5">
                    {diff.files.map((file) => (
                      <button
                        key={`${file.previousPath ?? ""}:${file.path}`}
                        type="button"
                        dir="ltr"
                        onClick={() => setSelectedPath(file.path)}
                        className={`flex min-w-0 items-center gap-2 rounded-lg px-2 py-2 text-left ${
                          selected?.path === file.path
                            ? "bg-muted"
                            : "hover:bg-muted/60"
                        }`}
                      >
                        <span className="min-w-0 flex-1 truncate font-mono text-[11px]">
                          {file.path}
                        </span>
                        <span className="font-mono text-[10px] text-primary">
                          +{file.additions}
                        </span>
                        <span className="font-mono text-[10px] text-destructive">
                          -{file.deletions}
                        </span>
                      </button>
                    ))}
                  </div>
                </ScrollArea>
                <div className="flex min-h-0 min-w-0 flex-col">
                  {selected ? (
                    <>
                      <div className="flex h-9 shrink-0 items-center gap-2 border-b px-3">
                        <span
                          dir="ltr"
                          className="min-w-0 flex-1 truncate font-mono text-xs"
                        >
                          {selected.path}
                        </span>
                        <Badge variant="outline" className="text-[9px]">
                          {STATUS_LABEL[selected.status]}
                        </Badge>
                      </div>
                      <ScrollArea className="min-h-0 flex-1">
                        <pre
                          dir="ltr"
                          className="min-w-max whitespace-pre p-3 text-left font-mono text-[11px] leading-5"
                        >
                          {selected.patch ? (
                            selected.patch.split("\n").map((line, index) => {
                              const added =
                                line.startsWith("+") &&
                                !line.startsWith("+++");
                              const deleted =
                                line.startsWith("-") &&
                                !line.startsWith("---");
                              return (
                                <span
                                  key={`${index}:${line.slice(0, 20)}`}
                                  className={
                                    added
                                      ? "block bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                                      : deleted
                                        ? "block bg-red-500/10 text-red-700 dark:text-red-300"
                                        : line.startsWith("@@")
                                          ? "block bg-blue-500/10 text-blue-700 dark:text-blue-300"
                                          : "block"
                                  }
                                >
                                  {line || " "}
                                </span>
                              );
                            })
                          ) : selected.status === "binary" ? (
                            "Binary file changed"
                          ) : (
                            "No textual patch available"
                          )}
                        </pre>
                        <ScrollBar orientation="horizontal" />
                      </ScrollArea>
                    </>
                  ) : null}
                </div>
              </div>
              {diff.truncated ? (
                <p className="text-xs text-muted-foreground">
                  دیف برای حفظ کارایی کوتاه شده است؛ آمار کامل فایل‌ها ذخیره شده.
                </p>
              ) : null}
            </DialogContent>
          </Dialog>

          <AlertDialog>
            <AlertDialogTrigger
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  className="h-6 gap-1 px-2 text-[10px] text-destructive"
                  disabled={restoring}
                >
                  <RotateCcwIcon className="size-3" />
                  بازگردانی
                </Button>
              }
            />
            <AlertDialogContent dir="rtl">
              <AlertDialogHeader>
                <AlertDialogTitle>بازگردانی این نوبت؟</AlertDialogTitle>
                <AlertDialogDescription>
                  همه تغییرهای فایل این نوبت به وضعیت پیش از اجرا برمی‌گردد.
                  اگر پروژه پس از آن تغییر کرده باشد، نیمروز برای محافظت از کار
                  جدید عملیات را متوقف می‌کند.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>انصراف</AlertDialogCancel>
                <AlertDialogAction
                  variant="destructive"
                  onClick={() => void restore()}
                >
                  بازگردانی تغییرها
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      ) : null}
    </div>
  );
}
