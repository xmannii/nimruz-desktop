"use client";

import { useAppShell } from "@/components/app-shell-context";
import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { CodexAccountStatus } from "@/lib/codex";
import {
  CODEX_PROVIDER_ID,
  OPENROUTER_PROVIDER_ID,
} from "@/lib/models/catalog";
import { useNavigate } from "@tanstack/react-router";
import { KeyRoundIcon, SparklesIcon } from "lucide-react";
import { useEffect, useState } from "react";

type ProviderSetupAlertProps = {
  refreshSignal?: number;
  providerId?: string;
};

export function ProviderSetupAlert({
  refreshSignal = 0,
  providerId,
}: ProviderSetupAlertProps) {
  const navigate = useNavigate();
  const { hasUsableModel, providers, models, isCatalogHydrated } = useAppShell();
  const [openrouterConfigured, setOpenrouterConfigured] = useState(true);
  const [secure, setSecure] = useState(true);
  const [codexStatus, setCodexStatus] = useState<CodexAccountStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    let unsubscribe: () => void = () => undefined;
    setIsLoading(true);
    setSecure(true);
    setOpenrouterConfigured(true);

    if (providerId === CODEX_PROVIDER_ID) {
      unsubscribe = window.desktop.codex.onStatusChange((status) => {
        if (cancelled) return;
        setCodexStatus(status);
        setIsLoading(false);
      });
      void window.desktop.codex
        .getStatus()
        .then((status) => {
          if (cancelled) return;
          setCodexStatus(status);
        })
        .catch((error: unknown) => {
          if (cancelled) return;
          setCodexStatus({
            state: "unavailable",
            email: null,
            planType: null,
            message: error instanceof Error ? error.message : null,
          });
        })
        .finally(() => {
          if (!cancelled) setIsLoading(false);
        });
    } else if (!providerId || providerId === OPENROUTER_PROVIDER_ID) {
      void window.desktop.credentials
        .getStatus(OPENROUTER_PROVIDER_ID)
        .then((status) => {
          if (cancelled) return;
          setOpenrouterConfigured(status.configured);
          setSecure(status.secure);
        })
        .catch(() => {
          if (cancelled) return;
          setOpenrouterConfigured(false);
        })
        .finally(() => {
          if (!cancelled) setIsLoading(false);
        });
    } else {
      setIsLoading(false);
    }

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [providerId, refreshSignal]);

  if (isLoading || !isCatalogHydrated) return null;

  const isCodexChat = providerId === CODEX_PROVIDER_ID;
  const selectedProvider = providerId
    ? providers.find((provider) => provider.id === providerId)
    : null;
  const hasUsableSelectedModel = providerId
    ? Boolean(
        selectedProvider?.enabled &&
          models.some(
            (model) => model.providerId === providerId && model.enabled
          )
      )
    : hasUsableModel;

  if (isCodexChat) {
    if (codexStatus?.state === "connected" && hasUsableSelectedModel) return null;

    const title =
      codexStatus?.state === "connected"
        ? "مدل Codex آماده نیست"
        : codexStatus?.state === "unavailable"
          ? "Codex در دسترس نیست"
          : codexStatus?.state === "error"
            ? "اتصال Codex نیاز به اصلاح دارد"
            : "اشتراک ChatGPT متصل نیست";
    const description =
      codexStatus?.state === "connected"
        ? "مدل‌های Codex را در تنظیمات تازه‌سازی کنید و دست‌کم یک مدل را فعال نگه دارید."
        : codexStatus?.state === "unavailable"
          ? codexStatus.message ??
            "اجرای Codex روی این دستگاه ممکن نیست. جزئیات را در تنظیمات مدل‌ها بررسی کنید."
          : codexStatus?.state === "error"
            ? codexStatus.message ??
              "از نشست فعلی خارج شوید و دوباره با اشتراک ChatGPT وارد شوید."
            : "برای ادامه این گفت‌وگوی Codex، حساب ChatGPT خود را در تنظیمات مدل‌ها متصل کنید.";

    return (
      <div className="shrink-0 border-b border-border px-3 py-3 sm:px-6">
        <Alert
          dir="rtl"
          variant="destructive"
          className="mx-auto max-w-3xl border-amber-500/40 bg-amber-500/10 text-amber-950 dark:text-amber-50"
        >
          <SparklesIcon />
          <AlertTitle>{title}</AlertTitle>
          <AlertDescription>{description}</AlertDescription>
          <AlertAction>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="border-amber-500/50 bg-background/80"
              onClick={() => {
                void navigate({
                  to: "/settings/models",
                  search: { provider: CODEX_PROVIDER_ID },
                });
              }}
            >
              تنظیم Codex
            </Button>
          </AlertAction>
        </Alert>
      </div>
    );
  }

  const openrouter = providers.find(
    (provider) => provider.id === OPENROUTER_PROVIDER_ID
  );
  const needsOpenRouterKey =
    (!providerId || providerId === OPENROUTER_PROVIDER_ID) &&
    Boolean(openrouter?.enabled) &&
    openrouter?.authRequired &&
    (!openrouterConfigured || !secure);

  if (hasUsableSelectedModel && !needsOpenRouterKey) return null;

  const title = !secure
    ? "رمزنگاری امن در دسترس نیست"
    : !hasUsableSelectedModel
      ? "مدل فعالی تنظیم نشده است"
      : "کلید OpenRouter تنظیم نشده است";

  const description = !secure
    ? "برای ذخیره کلید API روی این سیستم، رمزنگاری امن (مثل libsecret) لازم است."
    : !hasUsableSelectedModel
      ? "برای این گفتگو، ارائه‌دهنده و دست‌کم یک مدل را در تنظیمات فعال کنید."
      : "برای استفاده از OpenRouter، کلید API را در تنظیمات مدل‌ها وارد کنید.";

  return (
    <div className="shrink-0 border-b border-border px-3 py-3 sm:px-6">
      <Alert
        dir="rtl"
        variant="destructive"
        className="mx-auto max-w-3xl border-amber-500/40 bg-amber-500/10 text-amber-950 dark:text-amber-50"
      >
        <KeyRoundIcon />
        <AlertTitle>{title}</AlertTitle>
        <AlertDescription>{description}</AlertDescription>
        {secure ? (
          <AlertAction>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="border-amber-500/50 bg-background/80"
              onClick={() => {
                void navigate({
                  to: "/settings/models",
                  search: { provider: providerId },
                });
              }}
            >
              تنظیم مدل‌ها
            </Button>
          </AlertAction>
        ) : null}
      </Alert>
    </div>
  );
}

/** @deprecated Prefer ProviderSetupAlert */
export const OpenRouterApiKeyAlert = ProviderSetupAlert;
