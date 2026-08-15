"use client";

import { useSpeech } from "@/components/speech/speech-provider";
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
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { openMicrophoneStream } from "@/lib/speech/microphone";
import { showMicrophonePermissionDeniedToast } from "@/lib/speech/microphone-permission";
import type {
  WakeWordPhase,
  WakeWordSettings,
  WakeWordStatus,
} from "@/lib/speech/wake-word";
import {
  DEFAULT_COMPANION_SHORTCUT_SETTINGS,
  formatCompanionAccelerator,
  keyboardEventToCompanionAccelerator,
  type CompanionShortcutSettings,
  type CompanionShortcutStatus,
} from "@/lib/settings/companion";
import {
  AlertTriangleIcon,
  AudioLinesIcon,
  CheckCircle2Icon,
  CommandIcon,
  PinIcon,
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
      <WakeWordSettingsSection />
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

          <Field className="rounded-2xl border border-border/70 bg-background p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <FieldContent>
                <FieldTitle className="flex items-center gap-2">
                  <PinIcon className="size-4" />
                  همیشه روی صفحه (Always on top)
                </FieldTitle>
                <FieldDescription>
                  با کلیک بیرون از دستیار، پنجره باز و بالاتر از پنجره‌های دیگر
                  باقی می‌ماند.
                </FieldDescription>
              </FieldContent>
              <Switch
                checked={settings.alwaysOnTop}
                disabled={!status || isSaving}
                aria-label="همیشه روی صفحه نگه‌داشتن دستیار سریع"
                onCheckedChange={(alwaysOnTop) =>
                  void saveSettings({ ...settings, alwaysOnTop })
                }
              />
            </div>
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
              بازگردانی تنظیمات پیش‌فرض
            </Button>
          </div>
        </FieldGroup>
      </SettingsSection>
    </div>
  );
}

function WakeWordSettingsSection() {
  const { selectedMicrophoneId, refreshMicrophones } = useSpeech();
  const [status, setStatus] = useState<WakeWordStatus | null>(null);
  const [thresholdDraft, setThresholdDraft] = useState<number | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let active = true;
    void window.desktop.speech.wakeWord.getStatus().then((next) => {
      if (!active) return;
      setStatus(next);
      setThresholdDraft((current) => current ?? next.settings.threshold * 100);
    });
    const unsubscribe = window.desktop.speech.wakeWord.onStatusChange((next) => {
      if (!active) return;
      setStatus(next);
      setThresholdDraft((current) => current ?? next.settings.threshold * 100);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  async function saveWakeWordSettings(settings: WakeWordSettings) {
    setIsSaving(true);
    try {
      const next = await window.desktop.speech.wakeWord.saveSettings(settings);
      setStatus(next);
      setThresholdDraft(next.settings.threshold * 100);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "ذخیره تنظیمات «هی نیمروز» ناموفق بود."
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function setEnabled(enabled: boolean) {
    if (!status) return;
    if (enabled) {
      try {
        const stream = await openMicrophoneStream(selectedMicrophoneId);
        for (const track of stream.getTracks()) track.stop();
        void refreshMicrophones().catch(() => undefined);
      } catch (error) {
        if (error instanceof DOMException && error.name === "NotAllowedError") {
          showMicrophonePermissionDeniedToast();
        } else {
          toast.error("میکروفن انتخاب‌شده در دسترس نیست.");
        }
        return;
      }
    }
    await saveWakeWordSettings({ ...status.settings, enabled });
  }

  function phaseBadge(phase: WakeWordPhase | undefined) {
    if (phase === "listening") {
      return <Badge variant="secondary">در حال شنیدن</Badge>;
    }
    if (phase === "loading") {
      return <Badge variant="outline">در حال آماده‌سازی</Badge>;
    }
    if (phase === "paused") {
      return <Badge variant="outline">موقتاً متوقف</Badge>;
    }
    if (phase === "error") {
      return <Badge variant="destructive">خطا</Badge>;
    }
    return <Badge variant="outline">غیرفعال</Badge>;
  }

  const threshold = thresholdDraft ?? 73;

  return (
    <SettingsSection
      title="هی نیمروز"
      description="با گفتن «هی نیمروز» شنوا را بدون لمس برنامه آماده کنید. تشخیص کاملاً روی دستگاه انجام می‌شود."
      icon={AudioLinesIcon}
    >
      <FieldGroup className="gap-4">
        <Field className="rounded-2xl border border-border/70 bg-background p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <FieldContent>
              <FieldTitle>فعال‌سازی با صدا</FieldTitle>
              <FieldDescription>
                وقتی نیمروز باز است، ضبط شنوا را همان‌جا شروع می‌کند؛ در غیر این
                صورت دستیار سریع را باز می‌کند و شروع به ضبط می‌کند. بعد از
                حرف‌زدن، کمی سکوت پیام را ارسال می‌کند.
              </FieldDescription>
            </FieldContent>
            <div className="flex items-center gap-2">
              {phaseBadge(status?.phase)}
              <Switch
                checked={status?.settings.enabled ?? false}
                disabled={!status || isSaving}
                aria-label="فعال‌کردن تشخیص هی نیمروز"
                onCheckedChange={(enabled) => void setEnabled(enabled)}
              />
            </div>
          </div>

          <div className="flex flex-col gap-3 rounded-xl bg-muted/60 p-3">
            <div className="flex items-center justify-between gap-3 text-sm">
              <FieldLabel htmlFor="wake-word-threshold">حساسیت تشخیص</FieldLabel>
              <span className="tabular-nums text-muted-foreground">
                {Math.round(threshold).toLocaleString("fa-IR")}٪
              </span>
            </div>
            <Slider
              id="wake-word-threshold"
              min={50}
              max={95}
              step={1}
              value={threshold}
              disabled={!status || isSaving}
              aria-label="حساسیت تشخیص هی نیمروز"
              onValueChange={(value) => {
                if (typeof value === "number") setThresholdDraft(value);
              }}
              onValueCommitted={(value) => {
                if (!status || typeof value !== "number") return;
                void saveWakeWordSettings({
                  ...status.settings,
                  threshold: value / 100,
                });
              }}
            />
            <p className="text-xs leading-5 text-muted-foreground">
              مقدار بالاتر، فعال‌شدن اشتباهی را کمتر می‌کند. مقدار پیشنهادی ۷۳٪
              است.
            </p>
          </div>
        </Field>

        {status?.error ? (
          <Alert variant="destructive">
            <AlertTriangleIcon />
            <AlertTitle>تشخیص «هی نیمروز» متوقف شد</AlertTitle>
            <AlertDescription>{status.error}</AlertDescription>
          </Alert>
        ) : (
          <Alert>
            <CheckCircle2Icon />
            <AlertTitle>خصوصی و آفلاین</AlertTitle>
            <AlertDescription>
              صدا فقط در حافظه کوتاه‌مدت پردازش می‌شود و هیچ فایل صوتی ذخیره یا
              ارسال نمی‌شود.
            </AlertDescription>
          </Alert>
        )}
      </FieldGroup>
    </SettingsSection>
  );
}
