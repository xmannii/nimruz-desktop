export const SYSTEM_FONT_VALUE = "__system__";
export const DEFAULT_FONT_FAMILY = "Vazirmatn";

export const COLOR_THEMES = [
  "default",
  "ocean",
  "forest",
  "rose",
  "violet",
  "slate",
] as const;
export type ColorTheme = (typeof COLOR_THEMES)[number];

export type AppearanceSettings = {
  fontFamily: string;
  colorTheme: ColorTheme;
};

export const DEFAULT_APPEARANCE_SETTINGS: AppearanceSettings = {
  fontFamily: DEFAULT_FONT_FAMILY,
  colorTheme: "default",
};

export type ColorThemeOption = {
  value: ColorTheme;
  label: string;
  description: string;
  preview: {
    background: string;
    primary: string;
  };
};

export const COLOR_THEME_OPTIONS: ColorThemeOption[] = [
  {
    value: "default",
    label: "نیمروز",
    description: "کرم گرم با طلایی آفتاب",
    preview: {
      background: "#f7f7f4",
      primary: "#d97706",
    },
  },
  {
    value: "ocean",
    label: "اقیانوس",
    description: "آبی-فیروزه‌ای آرام",
    preview: {
      background: "#eef4f8",
      primary: "#1a7a8a",
    },
  },
  {
    value: "forest",
    label: "جنگل",
    description: "سبز طبیعی و تازه",
    preview: {
      background: "#f0f5f0",
      primary: "#2d6a4f",
    },
  },
  {
    value: "rose",
    label: "گل‌سرخ",
    description: "صورتی گرم و دوستانه",
    preview: {
      background: "#faf5f4",
      primary: "#c44d6e",
    },
  },
  {
    value: "violet",
    label: "بنفش",
    description: "بنفش مدرن و جسور",
    preview: {
      background: "#f6f3fa",
      primary: "#7c3aed",
    },
  },
  {
    value: "slate",
    label: "سنگی",
    description: "خنثی و حرفه‌ای",
    preview: {
      background: "#f4f5f7",
      primary: "#475569",
    },
  },
];

const LEGACY_FONT_MAP: Record<string, string> = {
  vazirmatn: DEFAULT_FONT_FAMILY,
  system: SYSTEM_FONT_VALUE,
};

const COLOR_THEME_SET = new Set<string>(COLOR_THEMES);
const MAX_FONT_FAMILY_LENGTH = 120;

export function sanitizeFontFamily(value: unknown): string {
  if (typeof value !== "string") return DEFAULT_FONT_FAMILY;

  const trimmed = value.trim();
  if (!trimmed) return DEFAULT_FONT_FAMILY;

  const legacy = LEGACY_FONT_MAP[trimmed.toLowerCase()];
  if (legacy) return legacy;

  if (trimmed.length > MAX_FONT_FAMILY_LENGTH) {
    return DEFAULT_FONT_FAMILY;
  }

  return trimmed;
}

export function getFontFamilyLabel(fontFamily: string): string {
  if (fontFamily === SYSTEM_FONT_VALUE) return "فونت سیستم";
  if (fontFamily === DEFAULT_FONT_FAMILY) return "وزیرمتن (پیش‌فرض)";
  return fontFamily;
}

export function sanitizeAppearanceSettings(value: unknown): AppearanceSettings {
  const settings =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};

  return {
    fontFamily: sanitizeFontFamily(settings.fontFamily),
    colorTheme:
      typeof settings.colorTheme === "string" &&
      COLOR_THEME_SET.has(settings.colorTheme)
        ? (settings.colorTheme as ColorTheme)
        : DEFAULT_APPEARANCE_SETTINGS.colorTheme,
  };
}

export async function loadAppearanceSettings(): Promise<AppearanceSettings> {
  return window.desktop.storage.loadAppearance();
}

export async function saveAppearanceSettings(
  settings: AppearanceSettings
): Promise<AppearanceSettings> {
  const sanitized = sanitizeAppearanceSettings(settings);
  return window.desktop.storage.saveAppearance(sanitized);
}

async function listFontsViaLocalAccessApi(): Promise<string[]> {
  const queryLocalFonts = (
    window as Window & {
      queryLocalFonts?: () => Promise<Array<{ family: string }>>;
    }
  ).queryLocalFonts;

  if (typeof queryLocalFonts !== "function") return [];

  try {
    const fonts = await queryLocalFonts();
    return [
      ...new Set(
        fonts
          .map((font) => font.family?.trim())
          .filter((family): family is string => Boolean(family))
      ),
    ].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  } catch {
    return [];
  }
}

export async function loadSystemFonts(): Promise<string[]> {
  try {
    const fromDesktop = await window.desktop.fonts?.list?.();
    if (Array.isArray(fromDesktop) && fromDesktop.length > 0) {
      return fromDesktop;
    }
  } catch (error) {
    console.error("Failed to load fonts via desktop API:", error);
  }

  return listFontsViaLocalAccessApi();
}
