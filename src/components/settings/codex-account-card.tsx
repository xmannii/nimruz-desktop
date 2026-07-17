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
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { CodexAccountStatus, CodexLoginResult } from "@/lib/codex";
import type { ModelCatalogSnapshot } from "@/lib/models/catalog";
import {
  CheckCircle2Icon,
  CopyIcon,
  KeyRoundIcon,
  Loader2Icon,
  LogInIcon,
  RefreshCwIcon,
  ShieldCheckIcon,
  SparklesIcon,
  UnplugIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

type CodexAccountCardProps = {
  status: CodexAccountStatus | null;
  loading: boolean;
  onStatusChange: (status: CodexAccountStatus) => void;
  onCatalogChange: (catalog: ModelCatalogSnapshot) => void;
};

type PendingAction =
  | "browser-login"
  | "device-login"
  | "cancel-login"
  | "refresh-status"
  | "sync-models"
  | "logout";

const PLAN_LABELS: Record<string, string> = {
  free: "ChatGPT Free",
  plus: "ChatGPT Plus",
  pro: "ChatGPT Pro",
  team: "ChatGPT Team",
  business: "ChatGPT Business",
  enterprise: "ChatGPT Enterprise",
  edu: "ChatGPT Edu",
  education: "ChatGPT Edu",
};

function getPlanLabel(planType: string | null) {
  if (!planType || planType === "unknown") return "طرح ChatGPT";
  const normalized = planType.trim().toLowerCase();
  return PLAN_LABELS[normalized] ?? `ChatGPT ${planType}`;
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function CodexAccountCard({
  status,
  loading,
  onStatusChange,
  onCatalogChange,
}: CodexAccountCardProps) {
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [login, setLogin] = useState<CodexLoginResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [logoutDialogOpen, setLogoutDialogOpen] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);

  useEffect(() => {
    if (status?.state === "connected") {
      setLogin(null);
      setError(null);
    } else if (status?.state === "disconnected" && status.message) {
      setLogin(null);
      setError(status.message);
    }
  }, [status?.message, status?.state]);

  async function startLogin(flow: "browser" | "device-code") {
    setPendingAction(flow === "browser" ? "browser-login" : "device-login");
    setError(null);
    try {
      const result = await window.desktop.codex.startLogin(flow);
      setLogin(result);
      toast.message(
        result.type === "browser"
          ? "مرورگر باز شد؛ ورود به حساب ChatGPT را آنجا کامل کنید."
          : "صفحه ورود باز شد؛ کد نمایش‌داده‌شده را وارد کنید."
      );
    } catch (cause) {
      setError(getErrorMessage(cause, "شروع ورود به ChatGPT ناموفق بود."));
    } finally {
      setPendingAction(null);
    }
  }

  async function refreshStatus() {
    setPendingAction("refresh-status");
    setError(null);
    try {
      const nextStatus = await window.desktop.codex.getStatus(true);
      onStatusChange(nextStatus);
      if (nextStatus.state === "connected") {
        const result = await window.desktop.codex.syncModels();
        onCatalogChange(result.catalog);
        setLogin(null);
        toast.success("حساب ChatGPT متصل شد و مدل‌های Codex آماده‌اند.");
      } else if (login) {
        toast.message("ورود هنوز کامل نشده است.");
      }
    } catch (cause) {
      setError(getErrorMessage(cause, "بررسی وضعیت حساب ناموفق بود."));
    } finally {
      setPendingAction(null);
    }
  }

  async function cancelLogin() {
    if (!login) return;
    setPendingAction("cancel-login");
    setError(null);
    try {
      await window.desktop.codex.cancelLogin(login.loginId);
      setLogin(null);
      toast.message("فرایند ورود لغو شد.");
    } catch (cause) {
      setError(getErrorMessage(cause, "لغو ورود ناموفق بود."));
    } finally {
      setPendingAction(null);
    }
  }

  async function syncModels() {
    setPendingAction("sync-models");
    setError(null);
    try {
      const result = await window.desktop.codex.syncModels();
      onCatalogChange(result.catalog);
      toast.success(
        `${result.count.toLocaleString("fa-IR")} مدل Codex همگام شد.`
      );
    } catch (cause) {
      setError(getErrorMessage(cause, "همگام‌سازی مدل‌های Codex ناموفق بود."));
    } finally {
      setPendingAction(null);
    }
  }

  async function logout() {
    setPendingAction("logout");
    setError(null);
    setLogoutError(null);
    try {
      await window.desktop.codex.logout();
      const nextStatus = await window.desktop.codex.getStatus();
      onStatusChange(nextStatus);
      setLogin(null);
      setLogoutDialogOpen(false);
      toast.success("اتصال حساب ChatGPT از Codex قطع شد.");
    } catch (cause) {
      const message = getErrorMessage(
        cause,
        "خروج از حساب Codex ناموفق بود."
      );
      setError(message);
      setLogoutError(message);
      toast.error(message);
    } finally {
      setPendingAction(null);
    }
  }

  async function copyDeviceCode() {
    if (login?.type !== "device-code") return;
    try {
      await navigator.clipboard.writeText(login.userCode);
      toast.success("کد ورود کپی شد.");
    } catch {
      toast.error("کپی خودکار ممکن نشد؛ کد را دستی کپی کنید.");
    }
  }

  const isBusy = pendingAction !== null;
  const statusError =
    status?.state === "unavailable" || status?.state === "error"
      ? status.message
      : null;

  return (
    <>
      <div className="mt-3 rounded-2xl border border-border/70 bg-background px-4 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <SparklesIcon className="size-5" />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-medium">حساب Codex</h3>
                {loading && !status ? (
                  <Badge variant="outline">در حال بررسی…</Badge>
                ) : status?.state === "connected" ? (
                  <Badge variant="secondary">
                    <CheckCircle2Icon data-icon="inline-start" />
                    متصل
                  </Badge>
                ) : status?.state === "unavailable" ? (
                  <Badge variant="destructive">در دسترس نیست</Badge>
                ) : status?.state === "error" ? (
                  <Badge variant="destructive">نیاز به اصلاح</Badge>
                ) : (
                  <Badge variant="outline">متصل نیست</Badge>
                )}
              </div>
              <p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">
                با ورود رسمی OpenAI از دسترسی Codex موجود در طرح ChatGPT خود
                استفاده کنید. نیمروز رمز عبور یا توکن حساب را نمی‌بیند؛ Codex
                نشست را در صندوق امن سیستم مدیریت می‌کند.
              </p>
            </div>
          </div>
        </div>

        {status?.state === "connected" ? (
          <div className="mt-4 rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-3">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <ShieldCheckIcon className="size-4 text-emerald-600 dark:text-emerald-400" />
              <span className="text-sm font-medium">
                {getPlanLabel(status.planType)}
              </span>
              {status.email ? (
                <span
                  className="truncate text-xs text-muted-foreground"
                  dir="ltr"
                >
                  {status.email}
                </span>
              ) : null}
            </div>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              مدل‌ها و سقف استفاده بر اساس طرح و فضای کاری ChatGPT شما تعیین
              می‌شوند.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={isBusy}
                onClick={() => void syncModels()}
              >
                {pendingAction === "sync-models" ? (
                  <Loader2Icon className="animate-spin" data-icon="inline-start" />
                ) : (
                  <RefreshCwIcon data-icon="inline-start" />
                )}
                تازه‌سازی مدل‌ها
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={isBusy}
                onClick={() => {
                  setLogoutError(null);
                  setLogoutDialogOpen(true);
                }}
              >
                <UnplugIcon data-icon="inline-start" />
                قطع اتصال
              </Button>
            </div>
          </div>
        ) : (
          <div className="mt-4">
            {login ? (
              <div className="rounded-xl border border-primary/25 bg-primary/5 p-3">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Loader2Icon className="size-4 animate-spin text-primary" />
                  در انتظار تکمیل ورود
                </div>
                {login.type === "device-code" ? (
                  <>
                    <p className="mt-2 text-xs leading-5 text-muted-foreground">
                      در صفحه OpenAI که باز شد، این کد را وارد کنید:
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <code
                        dir="ltr"
                        className="rounded-lg border bg-background px-3 py-2 text-base font-semibold tracking-[0.18em]"
                      >
                        {login.userCode}
                      </code>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={isBusy}
                        onClick={() => void copyDeviceCode()}
                      >
                        <CopyIcon data-icon="inline-start" />
                        کپی کد
                      </Button>
                    </div>
                  </>
                ) : (
                  <p className="mt-2 text-xs leading-5 text-muted-foreground">
                    مرورگر باز شده است. ورود به حساب ChatGPT را کامل کنید و سپس
                    وضعیت را بررسی کنید.
                  </p>
                )}
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    disabled={isBusy}
                    onClick={() => void refreshStatus()}
                  >
                    {pendingAction === "refresh-status" ? (
                      <Loader2Icon
                        className="animate-spin"
                        data-icon="inline-start"
                      />
                    ) : (
                      <RefreshCwIcon data-icon="inline-start" />
                    )}
                    بررسی وضعیت
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={isBusy}
                    onClick={() => void cancelLogin()}
                  >
                    لغو ورود
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {status?.state === "error" ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    disabled={isBusy}
                    onClick={() => {
                      setLogoutError(null);
                      setLogoutDialogOpen(true);
                    }}
                  >
                    <UnplugIcon data-icon="inline-start" />
                    پاک‌کردن نشست فعلی
                  </Button>
                ) : (
                  <>
                    <Button
                      type="button"
                      size="sm"
                      disabled={
                        isBusy || loading || status?.state === "unavailable"
                      }
                      onClick={() => void startLogin("browser")}
                    >
                      {pendingAction === "browser-login" ? (
                        <Loader2Icon
                          className="animate-spin"
                          data-icon="inline-start"
                        />
                      ) : (
                        <LogInIcon data-icon="inline-start" />
                      )}
                      ورود با مرورگر
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={
                        isBusy || loading || status?.state === "unavailable"
                      }
                      onClick={() => void startLogin("device-code")}
                    >
                      {pendingAction === "device-login" ? (
                        <Loader2Icon
                          className="animate-spin"
                          data-icon="inline-start"
                        />
                      ) : (
                        <KeyRoundIcon data-icon="inline-start" />
                      )}
                      ورود با کد دستگاه
                    </Button>
                  </>
                )}
                {status?.state === "unavailable" || status?.state === "error" ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={isBusy}
                    onClick={() => void refreshStatus()}
                  >
                    {pendingAction === "refresh-status" ? (
                      <Loader2Icon
                        className="animate-spin"
                        data-icon="inline-start"
                      />
                    ) : (
                      <RefreshCwIcon data-icon="inline-start" />
                    )}
                    تلاش دوباره
                  </Button>
                ) : null}
              </div>
            )}
          </div>
        )}

        {error || statusError ? (
          <p
            role="alert"
            className="mt-3 rounded-xl border border-destructive/25 bg-destructive/5 px-3 py-2 text-xs leading-5 text-destructive"
          >
            {error ?? statusError}
          </p>
        ) : null}
      </div>

      <AlertDialog
        open={logoutDialogOpen}
        onOpenChange={(open) => {
          if (pendingAction === "logout") return;
          setLogoutDialogOpen(open);
          if (!open) setLogoutError(null);
        }}
      >
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>اتصال حساب ChatGPT قطع شود؟</AlertDialogTitle>
            <AlertDialogDescription>
              از نشست Codex خارج می‌شوید و برای استفاده دوباره باید با ChatGPT
              وارد شوید. گفتگوهای ذخیره‌شده حذف نمی‌شوند.
            </AlertDialogDescription>
            {logoutError ? (
              <p
                role="alert"
                className="rounded-lg border border-destructive/25 bg-destructive/5 px-3 py-2 text-xs leading-5 text-destructive"
              >
                {logoutError}
              </p>
            ) : null}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pendingAction === "logout"}>
              انصراف
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={pendingAction === "logout"}
              onClick={(event) => {
                event.preventDefault();
                void logout();
              }}
            >
              {pendingAction === "logout" ? "در حال خروج…" : "قطع اتصال"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
