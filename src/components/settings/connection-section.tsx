"use client";

import { useAppShell } from "@/components/app-shell-context";
import { SettingsSection } from "@/components/settings/settings-section";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type {
  CredentialStatus,
  CredentialTestResult,
} from "@/lib/desktop-api";
import { cn } from "@/lib/utils";
import {
  CheckIcon,
  KeyRoundIcon,
  Loader2Icon,
  Trash2Icon,
} from "lucide-react";
import { useEffect, useState } from "react";

export function ConnectionSettingsSection() {
  const { bumpCredentialRefresh } = useAppShell();
  const [credentialStatus, setCredentialStatus] =
    useState<CredentialStatus | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [credentialResult, setCredentialResult] =
    useState<CredentialTestResult | null>(null);
  const [credentialBusy, setCredentialBusy] = useState(false);

  useEffect(() => {
    void window.desktop.credentials
      .getStatus()
      .then(setCredentialStatus)
      .catch((error) => {
        setCredentialResult({
          ok: false,
          message:
            error instanceof Error
              ? error.message
              : "خواندن وضعیت کلید ممکن نشد.",
        });
      });
  }, []);

  async function handleSaveApiKey() {
    if (!apiKey.trim()) return;
    setCredentialBusy(true);
    setCredentialResult(null);
    try {
      const status = await window.desktop.credentials.setOpenRouterKey(apiKey);
      setCredentialStatus(status);
      setApiKey("");
      setCredentialResult({
        ok: true,
        message: "کلید OpenRouter با موفقیت ذخیره شد.",
      });
      bumpCredentialRefresh();
    } catch (error) {
      setCredentialResult({
        ok: false,
        message:
          error instanceof Error ? error.message : "ذخیره کلید ناموفق بود.",
      });
    } finally {
      setCredentialBusy(false);
    }
  }

  async function handleTestApiKey() {
    setCredentialBusy(true);
    setCredentialResult(null);
    try {
      setCredentialResult(
        await window.desktop.credentials.testOpenRouterKey(
          apiKey.trim() || undefined
        )
      );
    } catch (error) {
      setCredentialResult({
        ok: false,
        message:
          error instanceof Error ? error.message : "آزمون اتصال ناموفق بود.",
      });
    } finally {
      setCredentialBusy(false);
    }
  }

  async function handleClearApiKey() {
    setCredentialBusy(true);
    try {
      setCredentialStatus(
        await window.desktop.credentials.clearOpenRouterKey()
      );
      setApiKey("");
      setCredentialResult({
        ok: true,
        message: "کلید OpenRouter حذف شد.",
      });
      bumpCredentialRefresh();
    } catch (error) {
      setCredentialResult({
        ok: false,
        message:
          error instanceof Error ? error.message : "حذف کلید ناموفق بود.",
      });
    } finally {
      setCredentialBusy(false);
    }
  }

  return (
    <SettingsSection
      title="کلید OpenRouter"
      description="کلید با سرویس امن سیستم‌عامل رمزگذاری می‌شود و هرگز دوباره نمایش داده نمی‌شود."
      icon={KeyRoundIcon}
    >
      <div className="flex flex-col gap-4">
        {credentialStatus ? (
          <div className="rounded-2xl border border-border/70 bg-muted/20 px-4 py-3 text-sm leading-6">
            <p>
              وضعیت:{" "}
              {credentialStatus.configured
                ? `تنظیم‌شده ${credentialStatus.hint ?? ""}`
                : "تنظیم‌نشده"}
            </p>
            <p className="text-muted-foreground">
              فضای امن: {credentialStatus.backend}
            </p>
          </div>
        ) : null}

        {credentialStatus && !credentialStatus.secure ? (
          <p className="rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm leading-6 text-destructive">
            فضای امن سیستم‌عامل در دسترس نیست. در لینوکس GNOME
            Keyring/libsecret یا KWallet را فعال و برنامه را دوباره اجرا کنید.
          </p>
        ) : null}

        <Field>
          <FieldLabel htmlFor="openrouter-api-key">کلید جدید</FieldLabel>
          <Input
            id="openrouter-api-key"
            dir="ltr"
            type="password"
            autoComplete="off"
            value={apiKey}
            placeholder="sk-or-v1-…"
            onChange={(event) => setApiKey(event.target.value)}
          />
        </Field>

        {credentialResult ? (
          <p
            className={cn(
              "text-sm leading-6",
              credentialResult.ok ? "text-foreground" : "text-destructive"
            )}
            role="status"
          >
            {credentialResult.message}
          </p>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            disabled={
              credentialBusy ||
              !apiKey.trim() ||
              credentialStatus?.secure === false
            }
            onClick={() => void handleSaveApiKey()}
          >
            {credentialBusy ? (
              <Loader2Icon className="animate-spin" />
            ) : (
              <CheckIcon />
            )}
            ذخیره کلید
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={
              credentialBusy ||
              (!apiKey.trim() && !credentialStatus?.configured)
            }
            onClick={() => void handleTestApiKey()}
          >
            آزمون اتصال
          </Button>
          {credentialStatus?.configured ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={credentialBusy}
              onClick={() => void handleClearApiKey()}
            >
              <Trash2Icon />
              حذف کلید
            </Button>
          ) : null}
        </div>
      </div>
    </SettingsSection>
  );
}
