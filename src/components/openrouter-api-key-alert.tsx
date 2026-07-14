"use client";

import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useCredentialStatus } from "@/hooks/use-credential-status";
import { KeyRoundIcon } from "lucide-react";
import { useEffect } from "react";

type OpenRouterApiKeyAlertProps = {
  onConfigure: () => void;
  refreshSignal?: number;
};

export function OpenRouterApiKeyAlert({
  onConfigure,
  refreshSignal = 0,
}: OpenRouterApiKeyAlertProps) {
  const { status, isLoading, needsApiKey, refresh } = useCredentialStatus();

  useEffect(() => {
    void refresh();
  }, [refresh, refreshSignal]);

  if (isLoading || !needsApiKey || !status) {
    return null;
  }

  const title = !status.secure
    ? "رمزنگاری امن در دسترس نیست"
    : "کلید OpenRouter تنظیم نشده است";

  const description = !status.secure
    ? "برای ذخیره کلید API روی این سیستم، رمزنگاری امن (مثل libsecret) لازم است. تا آن زمان امکان گفتگو با مدل‌ها وجود ندارد."
    : "برای شروع گفتگو، کلید API خود را از OpenRouter در تنظیمات وارد کنید.";

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
        {status.secure ? (
          <AlertAction>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="border-amber-500/50 bg-background/80"
              onClick={onConfigure}
            >
              افزودن کلید
            </Button>
          </AlertAction>
        ) : null}
      </Alert>
    </div>
  );
}
