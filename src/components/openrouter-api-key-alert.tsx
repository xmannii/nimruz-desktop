"use client";

import { useAppShell } from "@/components/app-shell-context";
import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { OPENROUTER_PROVIDER_ID } from "@/lib/models/catalog";
import { useNavigate } from "@tanstack/react-router";
import { KeyRoundIcon } from "lucide-react";
import { useEffect, useState } from "react";

type ProviderSetupAlertProps = {
  refreshSignal?: number;
};

export function ProviderSetupAlert({ refreshSignal = 0 }: ProviderSetupAlertProps) {
  const navigate = useNavigate();
  const { hasUsableModel, providers, isCatalogHydrated } = useAppShell();
  const [openrouterConfigured, setOpenrouterConfigured] = useState(true);
  const [secure, setSecure] = useState(true);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
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
    return () => {
      cancelled = true;
    };
  }, [refreshSignal]);

  if (isLoading || !isCatalogHydrated) return null;

  const openrouter = providers.find(
    (provider) => provider.id === OPENROUTER_PROVIDER_ID
  );
  const needsOpenRouterKey =
    Boolean(openrouter?.enabled) &&
    openrouter?.authRequired &&
    (!openrouterConfigured || !secure);

  if (hasUsableModel && !needsOpenRouterKey) return null;

  const title = !secure
    ? "رمزنگاری امن در دسترس نیست"
    : !hasUsableModel
      ? "مدل فعالی تنظیم نشده است"
      : "کلید OpenRouter تنظیم نشده است";

  const description = !secure
    ? "برای ذخیره کلید API روی این سیستم، رمزنگاری امن (مثل libsecret) لازم است."
    : !hasUsableModel
      ? "یک ارائه‌دهنده و مدل را در تنظیمات فعال کنید، یا کلید OpenRouter را وارد کنید."
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
                void navigate({ to: "/settings/models" });
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
