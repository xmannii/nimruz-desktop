"use client";

import { SettingsSection } from "@/components/settings/settings-section";
import { cn } from "@/lib/utils";
import { MonitorIcon, MoonIcon, PaletteIcon, SunIcon } from "lucide-react";
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
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const activeTheme = mounted ? (theme ?? "system") : "system";

  return (
    <SettingsSection
      title="ظاهر"
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
  );
}
