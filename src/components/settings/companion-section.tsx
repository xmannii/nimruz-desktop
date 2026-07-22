"use client";

import { SettingsSection } from "@/components/settings/settings-section";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldTitle,
} from "@/components/ui/field";
import { Kbd } from "@/components/ui/kbd";
import { Switch } from "@/components/ui/switch";
import {
  DEFAULT_COMPANION_SHORTCUT_SETTINGS,
  formatCompanionAccelerator,
  keyboardEventToCompanionAccelerator,
  type CompanionShortcutSettings,
  type CompanionShortcutStatus,
} from "@/lib/settings/companion";
import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  CommandIcon,
  RotateCcwIcon,
} from "lucide-react";
import { useEffect, useState, type KeyboardEvent } from "react";
import { toast } from "sonner";

export function CompanionSettingsSection() {
  const [status, setStatus] = useState<CompanionShortcutStatus | null>(null);
  const [recordingTarget, setRecordingTarget] = useState<
    "open" | "microphone" | null
  >(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let active = true;
    void window.desktop.companion.getShortcutStatus().then((next) => {
      if (active) setStatus(next);
    });
    const unsubscribe = window.desktop.companion.onShortcutStatus((next) => {
      if (active) setStatus(next);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  async function saveSettings(settings: CompanionShortcutSettings) {
    setIsSaving(true);
    try {
      const next = await window.desktop.companion.setShortcutSettings(settings);
      setStatus(next);
      if (
        next.state === "unavailable" ||
        next.microphoneState === "unavailable"
      ) {
        toast.error("این میانبر در اختیار macOS یا برنامه دیگری است.");
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "ذخیره میانبر ناموفق بود."
      );
    } finally {
      setIsSaving(false);
    }
  }

  function handleShortcutKeyDown(
    target: "open" | "microphone",
    event: KeyboardEvent<HTMLButtonElement>
  ) {
    event.preventDefault();
    event.stopPropagation();
    if (event.key === "Escape") {
      setRecordingTarget(null);
      return;
    }
    const accelerator = keyboardEventToCompanionAccelerator(
      event,
      window.desktop.platform
    );
    if (!accelerator || !status) return;
    setRecordingTarget(null);
    void saveSettings(
      target === "open"
        ? { ...settings, enabled: true, accelerator }
        : {
            ...settings,
            microphoneEnabled: true,
            microphoneAccelerator: accelerator,
          }
    );
  }

  const settings = status?.settings ?? DEFAULT_COMPANION_SHORTCUT_SETTINGS;
  const shortcutLabel = formatCompanionAccelerator(
    settings.accelerator,
    window.desktop.platform
  );
  const microphoneShortcutLabel = formatCompanionAccelerator(
    settings.microphoneAccelerator,
    window.desktop.platform
  );

  function statusBadge(state: CompanionShortcutStatus["state"] | undefined) {
    if (state === "registered") {
      return <Badge variant="secondary">فعال</Badge>;
    }
    if (state === "unavailable") {
      return <Badge variant="destructive">در دسترس نیست</Badge>;
    }
    return <Badge variant="outline">غیرفعال</Badge>;
  }

  return (
    <div className="flex flex-col gap-10">
      <SettingsSection
        title="دستیار سریع"
        description="دستیار جمع‌وجور نیمروز را از هر جای macOS یا Windows با یک میانبر سراسری باز کنید."
        icon={CommandIcon}
      >
        <FieldGroup className="gap-4">
          <Field className="rounded-2xl border border-border/70 bg-background p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <FieldContent>
                <FieldTitle>بازکردن دستیار سریع</FieldTitle>
                <FieldDescription>
                  پنجره دستیار را از هر جایی باز یا پنهان می‌کند.
                </FieldDescription>
              </FieldContent>
              <div className="flex items-center gap-2">
                {statusBadge(status?.state)}
                <Switch
                  checked={settings.enabled}
                  disabled={!status || isSaving}
                  aria-label="فعال‌کردن میانبر بازکردن دستیار سریع"
                  onCheckedChange={(enabled) =>
                    void saveSettings({ ...settings, enabled })
                  }
                />
              </div>
            </div>
            <Button
              id="companion-shortcut"
              type="button"
              variant="outline"
              disabled={!status || isSaving}
              aria-pressed={recordingTarget === "open"}
              onClick={() => setRecordingTarget("open")}
              onBlur={() => setRecordingTarget(null)}
              onKeyDown={(event) => handleShortcutKeyDown("open", event)}
              className="h-14 w-full justify-between rounded-xl px-4"
            >
              <span className="text-sm text-muted-foreground">
                {recordingTarget === "open"
                  ? "ترکیب دلخواه را فشار دهید…"
                  : "میانبر فعلی"}
              </span>
              <Kbd className="h-7 bg-muted px-2.5 text-sm text-foreground">
                {recordingTarget === "open" ? "…" : shortcutLabel}
              </Kbd>
            </Button>
          </Field>

          <Field className="rounded-2xl border border-border/70 bg-background p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <FieldContent>
                <FieldTitle>بازکردن میکروفن</FieldTitle>
                <FieldDescription>
                  دستیار را باز می‌کند و ضبط گفتار را شروع یا متوقف می‌کند.
                </FieldDescription>
              </FieldContent>
              <div className="flex items-center gap-2">
                {statusBadge(status?.microphoneState)}
                <Switch
                  checked={settings.microphoneEnabled}
                  disabled={!status || isSaving}
                  aria-label="فعال‌کردن میانبر میکروفن دستیار سریع"
                  onCheckedChange={(microphoneEnabled) =>
                    void saveSettings({ ...settings, microphoneEnabled })
                  }
                />
              </div>
            </div>
            <Button
              id="companion-microphone-shortcut"
              type="button"
              variant="outline"
              disabled={!status || isSaving}
              aria-pressed={recordingTarget === "microphone"}
              onClick={() => setRecordingTarget("microphone")}
              onBlur={() => setRecordingTarget(null)}
              onKeyDown={(event) =>
                handleShortcutKeyDown("microphone", event)
              }
              className="h-14 w-full justify-between rounded-xl px-4"
            >
              <span className="text-sm text-muted-foreground">
                {recordingTarget === "microphone"
                  ? "ترکیب دلخواه را فشار دهید…"
                  : "میانبر فعلی"}
              </span>
              <Kbd className="h-7 bg-muted px-2.5 text-sm text-foreground">
                {recordingTarget === "microphone"
                  ? "…"
                  : microphoneShortcutLabel}
              </Kbd>
            </Button>
          </Field>

          {status?.state === "unavailable" ||
          status?.microphoneState === "unavailable" ? (
            <Alert variant="destructive">
              <AlertTriangleIcon />
              <AlertTitle>این میانبر قابل ثبت نیست</AlertTitle>
              <AlertDescription>
                macOS، Windows یا برنامه دیگری این ترکیب را گرفته است. یک ترکیب
                دیگر انتخاب کنید؛ بازکردن دستیار از آیکن نوار سیستم همچنان کار می‌کند.
              </AlertDescription>
            </Alert>
          ) : status?.state === "registered" ||
            status?.microphoneState === "registered" ? (
            <Alert>
              <CheckCircle2Icon />
              <AlertTitle>میانبر آماده است</AlertTitle>
              <AlertDescription>
                <Kbd>{shortcutLabel}</Kbd> برای بازکردن دستیار و{" "}
                <Kbd>{microphoneShortcutLabel}</Kbd> برای شروع گفتار آماده‌اند.
              </AlertDescription>
            </Alert>
          ) : null}

          <div className="flex justify-end">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={isSaving}
              onClick={() => void saveSettings(DEFAULT_COMPANION_SHORTCUT_SETTINGS)}
            >
              <RotateCcwIcon />
              بازگردانی میانبر پیش‌فرض
            </Button>
          </div>
        </FieldGroup>
      </SettingsSection>
    </div>
  );
}
