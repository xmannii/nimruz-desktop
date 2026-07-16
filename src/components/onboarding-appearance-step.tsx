"use client";

import { FontPicker } from "@/components/settings/font-picker";
import { useAppearanceSettings } from "@/hooks/use-appearance-settings";
import { COLOR_THEME_OPTIONS, type ColorTheme } from "@/lib/settings/appearance";
import { cn } from "@/lib/utils";
import { MonitorIcon, MoonIcon, SunIcon } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

const MODE_OPTIONS = [
  { value: "light", label: "روشن", icon: SunIcon },
  { value: "dark", label: "تیره", icon: MoonIcon },
  { value: "system", label: "سیستم", icon: MonitorIcon },
] as const;

export function OnboardingAppearanceStep() {
  const { theme, setTheme } = useTheme();
  const { appearance, isHydrated, updateAppearance } = useAppearanceSettings();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const activeMode = mounted ? (theme ?? "system") : "system";

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground">حالت روشن/تیره</p>
        <div className="grid grid-cols-3 gap-2">
          {MODE_OPTIONS.map((option) => {
            const Icon = option.icon;
            const isSelected = activeMode === option.value;

            return (
              <button
                key={option.value}
                type="button"
                disabled={!mounted}
                aria-pressed={isSelected}
                onClick={() => setTheme(option.value)}
                className={cn(
                  "flex flex-col items-center gap-1.5 rounded-xl border px-2 py-2.5 text-xs transition-colors",
                  isSelected
                    ? "border-primary/40 bg-primary/5 ring-1 ring-primary/20"
                    : "border-border/70 bg-background hover:bg-muted/50"
                )}
              >
                <Icon className="size-3.5 text-muted-foreground" />
                <span className="font-medium">{option.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground">پالت رنگ</p>
        <div className="grid grid-cols-3 gap-2">
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
                  updateAppearance({
                    ...appearance,
                    colorTheme: option.value as ColorTheme,
                  })
                }
                className={cn(
                  "rounded-xl border px-2.5 py-2.5 text-right transition-colors",
                  isSelected
                    ? "border-primary/40 bg-primary/5 ring-1 ring-primary/20"
                    : "border-border/70 bg-background hover:bg-muted/50"
                )}
              >
                <span className="mb-1.5 flex items-center gap-1">
                  <span
                    className="size-4 rounded-md border border-black/10"
                    style={{ background: option.preview.background }}
                  />
                  <span
                    className="size-4 rounded-md border border-black/10"
                    style={{ background: option.preview.primary }}
                  />
                </span>
                <span className="block text-xs font-medium">{option.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground">فونت</p>
        <FontPicker
          value={appearance.fontFamily}
          onValueChange={(fontFamily) =>
            updateAppearance({ ...appearance, fontFamily })
          }
          disabled={!isHydrated}
        />
      </div>
    </div>
  );
}
