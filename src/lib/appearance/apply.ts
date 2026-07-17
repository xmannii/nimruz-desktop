import {
  DEFAULT_APPEARANCE_SETTINGS,
  DEFAULT_FONT_FAMILY,
  SYSTEM_FONT_VALUE,
  type AppearanceSettings,
} from "@/lib/settings/appearance";

function escapeFontFamily(name: string) {
  return name.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function buildFontStack(fontFamily: string): string {
  if (fontFamily === SYSTEM_FONT_VALUE) {
    return 'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif';
  }

  const family =
    fontFamily === DEFAULT_FONT_FAMILY
      ? `"${escapeFontFamily(fontFamily)}"`
      : `"${escapeFontFamily(fontFamily)}"`;

  return `${family}, ui-sans-serif, system-ui, sans-serif`;
}

export function applyAppearanceSettings(
  settings: AppearanceSettings = DEFAULT_APPEARANCE_SETTINGS
) {
  const root = document.documentElement;
  root.dataset.colorTheme = settings.colorTheme;
  root.style.setProperty("--font-ui", buildFontStack(settings.fontFamily));
}
