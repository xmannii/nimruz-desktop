"use client";

import { FontPicker } from "@/components/settings/font-picker";
import { SettingsSection } from "@/components/settings/settings-section";
import { useAppearanceSettings } from "@/hooks/use-appearance-settings";
import { COLOR_THEME_OPTIONS, type ColorTheme } from "@/lib/settings/appearance";
import { cn } from "@/lib/utils";
import {
  MonitorIcon,
  MoonIcon,
  PaletteIcon,
  SunIcon,
  TypeIcon,
} from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

const THEME_OPTIONS = [
  {
    value: "light",
    label: "روشن",
    description: "همیشه تم روشن",
    icon: SunIcon,
  },
  {
    value: "dark",
    label: "تیره",
    description: "همیشه تم تیره",
    icon: MoonIcon,
  },
  {
    value: "system",
    label: "سیستم",
    description: "هماهنگ با سیستم‌عامل",
    icon: MonitorIcon,
  },
] as const;

export function AppearanceSettingsSection() {
  const { theme, setTheme } = useTheme();
  const { appearance, isHydrated, updateAppearance } = useAppearanceSettings();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const activeTheme = mounted ? (theme ?? "system") : "system";

  function updateDraft<Key extends keyof typeof appearance>(
    key: Key,
    value: (typeof appearance)[Key]
  ) {
    updateAppearance({ ...appearance, [key]: value });
  }

  return (
    <div className="flex flex-col gap-10">
      <SettingsSection
        title="حالت روشن/تیره"
        description="تم برنامه را انتخاب کنید. میانبر تم در نوار عنوان هم در دسترس است."
        icon={PaletteIcon}
      >
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {THEME_OPTIONS.map((option) => {
            const Icon = option.icon;
            const isSelected = activeTheme === option.value;

            return (
              <button
                key={option.value}
                type="button"
                disabled={!mounted}
                aria-pressed={isSelected}
                onClick={() => setTheme(option.value)}
                className={cn(
                  "rounded-2xl border px-3.5 py-3 text-right transition-colors",
                  isSelected
                    ? "border-primary/40 bg-primary/5 ring-1 ring-primary/20"
                    : "border-border/70 bg-background hover:bg-muted/50"
                )}
              >
                <span className="mb-2 flex size-8 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                  <Icon className="size-4" />
                </span>
                <span className="block text-sm font-medium">{option.label}</span>
                <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">
                  {option.description}
                </span>
              </button>
            );
          })}
        </div>
      </SettingsSection>

      <SettingsSection
        title="فونت"
        description="هر فونت نصب‌شده روی سیستم را انتخاب کنید. وزیرمتن پیش‌فرض است."
        icon={TypeIcon}
      >
        <FontPicker
          value={appearance.fontFamily}
          onValueChange={(fontFamily) => updateDraft("fontFamily", fontFamily)}
          disabled={!isHydrated}
        />
      </SettingsSection>

      <SettingsSection
        title="پالت رنگ"
        description="رنگ‌بندی کلی برنامه را تغییر دهید. با حالت روشن/تیره ترکیب می‌شود."
        icon={PaletteIcon}
      >
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {COLOR_THEME_OPTIONS.map((option) => {
            const isSelected =
              isHydrated && appearance.colorTheme === option.value;

            return (
              <button
                key={option.value}
                type="button"
                disabled={!isHydrated}
                aria-pressed={isSelected}
                onClick={() =>
                  updateDraft("colorTheme", option.value as ColorTheme)
                }
                className={cn(
                  "rounded-2xl border px-3.5 py-3 text-right transition-colors",
                  isSelected
                    ? "border-primary/40 bg-primary/5 ring-1 ring-primary/20"
                    : "border-border/70 bg-background hover:bg-muted/50"
                )}
              >
                <span className="mb-2 flex items-center gap-1.5">
                  <span
                    className="size-6 rounded-md border border-black/10"
                    style={{ background: option.preview.background }}
                  />
                  <span
                    className="size-6 rounded-md border border-black/10"
                    style={{ background: option.preview.primary }}
                  />
                </span>
                <span className="block text-sm font-medium">{option.label}</span>
                <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">
                  {option.description}
                </span>
              </button>
            );
          })}
        </div>
      </SettingsSection>
    </div>
  );
}
