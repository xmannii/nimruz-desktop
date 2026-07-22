"use client";

import { SettingsSection } from "@/components/settings/settings-section";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLegend,
  FieldSet,
  FieldTitle,
} from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { playCompletionDing } from "@/lib/notifications/sound";
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  type NotificationSettings,
} from "@/lib/settings/notifications";
import { BellRingIcon, Volume2Icon } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

type BooleanSettingKey = {
  [Key in keyof NotificationSettings]: NotificationSettings[Key] extends boolean
    ? Key
    : never;
}[keyof NotificationSettings];

const CATEGORY_FIELDS: Array<{
  key: BooleanSettingKey;
  title: string;
  description: string;
}> = [
  {
    key: "agentCompleted",
    title: "پایان موفق کار ایجنت",
    description: "وقتی پاسخ یا اجرای ایجنت با موفقیت تمام شد.",
  },
  {
    key: "agentFailed",
    title: "ناموفق بودن اجرای ایجنت",
    description: "وقتی ایجنت به خطا خورد یا نتوانست کار را کامل کند.",
  },
  {
    key: "approvalRequired",
    title: "نیاز به تأیید",
    description: "وقتی ایجنت برای ادامه کار منتظر اجازه شما است.",
  },
  {
    key: "modelDownloads",
    title: "پایان دانلود مدل",
    description: "وقتی دانلود یک مدل گفتار شنوا کامل شد.",
  },
];

export function NotificationsSettingsSection() {
  const [settings, setSettings] = useState(DEFAULT_NOTIFICATION_SETTINGS);
  const [isHydrated, setIsHydrated] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void window.desktop.notifications
      .getSettings()
      .then((value) => {
        if (!cancelled) setSettings(value);
      })
      .catch(() => {
        if (!cancelled) toast.error("خواندن تنظیمات اعلان‌ها ناموفق بود.");
      })
      .finally(() => {
        if (!cancelled) setIsHydrated(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function updateSetting(key: BooleanSettingKey, checked: boolean) {
    if (isSaving) return;
    const previous = settings;
    const next = { ...settings, [key]: checked };
    setSettings(next);
    setIsSaving(true);
    try {
      setSettings(await window.desktop.notifications.saveSettings(next));
    } catch {
      setSettings(previous);
      toast.error("ذخیره تنظیمات اعلان‌ها ناموفق بود.");
    } finally {
      setIsSaving(false);
    }
  }

  const controlsDisabled = !isHydrated || isSaving;
  const categoriesDisabled =
    controlsDisabled || !settings.desktopNotificationsEnabled;

  return (
    <div className="flex flex-col gap-10">
      <SettingsSection
        title="اعلان‌های سیستم"
        description="وقتی نیمروز در پس‌زمینه است، نتیجه کارهای مهم را از طریق اعلان ویندوز یا macOS نمایش می‌دهد."
        icon={BellRingIcon}
      >
        <FieldGroup>
          <Field orientation="horizontal">
            <FieldContent>
              <FieldTitle id="desktop-notifications-title">
                فعال‌سازی اعلان‌ها
              </FieldTitle>
              <FieldDescription>
                اعلان‌های بومی سیستم‌عامل را روشن یا خاموش کنید.
              </FieldDescription>
            </FieldContent>
            <Switch
              aria-labelledby="desktop-notifications-title"
              checked={settings.desktopNotificationsEnabled}
              disabled={controlsDisabled}
              onCheckedChange={(checked) =>
                void updateSetting("desktopNotificationsEnabled", checked)
              }
            />
          </Field>

          <FieldSet disabled={categoriesDisabled}>
            <FieldLegend variant="label">نوع اعلان‌ها</FieldLegend>
            <FieldDescription>
              فقط رویدادهایی را نگه دارید که برای شما مهم‌اند.
            </FieldDescription>
            <FieldGroup className="gap-5">
              {CATEGORY_FIELDS.map((field) => {
                const titleId = `notification-${field.key}-title`;
                return (
                  <Field
                    key={field.key}
                    orientation="horizontal"
                    data-disabled={categoriesDisabled || undefined}
                  >
                    <FieldContent>
                      <FieldTitle id={titleId}>{field.title}</FieldTitle>
                      <FieldDescription>{field.description}</FieldDescription>
                    </FieldContent>
                    <Switch
                      aria-labelledby={titleId}
                      checked={settings[field.key]}
                      disabled={categoriesDisabled}
                      onCheckedChange={(checked) =>
                        void updateSetting(field.key, checked)
                      }
                    />
                  </Field>
                );
              })}
            </FieldGroup>
          </FieldSet>
        </FieldGroup>
      </SettingsSection>

      <SettingsSection
        title="صدای پایان کار"
        description="یک صدای کوتاه و ملایم پس از پایان موفق کار ایجنت پخش می‌شود؛ حتی وقتی خود برنامه باز است."
        icon={Volume2Icon}
      >
        <FieldGroup>
          <Field orientation="horizontal">
            <FieldContent>
              <FieldTitle id="completion-sound-title">
                پخش صدای کوتاه
              </FieldTitle>
              <FieldDescription>
                این گزینه مستقل از اعلان‌های سیستم است و به‌صورت پیش‌فرض خاموش است.
              </FieldDescription>
            </FieldContent>
            <Switch
              aria-labelledby="completion-sound-title"
              checked={settings.completionSound}
              disabled={controlsDisabled}
              onCheckedChange={(checked) =>
                void updateSetting("completionSound", checked)
              }
            />
          </Field>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="self-start"
            disabled={!isHydrated}
            onClick={() =>
              void playCompletionDing().catch(() =>
                toast.error("پخش صدای نمونه ناموفق بود.")
              )
            }
          >
            <Volume2Icon data-icon="inline-start" />
            پخش نمونه صدا
          </Button>
        </FieldGroup>
      </SettingsSection>
    </div>
  );
}
