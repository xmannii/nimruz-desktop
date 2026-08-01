export const SYSTEM_FONT_VALUE = "__system__";
export const DEFAULT_FONT_FAMILY = "Vazirmatn";

/** Tribute to the late designer of Vazirmatn. */
export const VAZIRMATN_DESIGNER = "صابر راستی‌کردار";
export const VAZIRMATN_CREDIT = `طراح فونت: زنده‌یاد ${VAZIRMATN_DESIGNER}`;

export const COLOR_THEMES = [
  "default",
  "ocean",
  "forest",
  "rose",
  "violet",
  "slate",
] as const;
export type ColorTheme = (typeof COLOR_THEMES)[number];

export const FONT_SIZES = ["small", "medium", "large", "x-large"] as const;
export type FontSize = (typeof FONT_SIZES)[number];

export type AppearanceSettings = {
  fontFamily: string;
  fontSize: FontSize;
  colorTheme: ColorTheme;
};

export const DEFAULT_APPEARANCE_SETTINGS: AppearanceSettings = {
  fontFamily: DEFAULT_FONT_FAMILY,
  fontSize: "medium",
  colorTheme: "default",
};

export type FontSizeOption = {
  value: FontSize;
  label: string;
  description: string;
  /** Root font-size in pixels (scales rem-based UI). */
  rootPx: number;
};

export const FONT_SIZE_OPTIONS: FontSizeOption[] = [
  {
    value: "small",
    label: "کوچک",
    description: "فشرده‌تر",
    rootPx: 14,
  },
  {
    value: "medium",
    label: "متوسط",
    description: "پیش‌فرض",
    rootPx: 16,
  },
  {
    value: "large",
    label: "بزرگ",
    description: "خواناتر",
    rootPx: 18,
  },
  {
    value: "x-large",
    label: "خیلی بزرگ",
    description: "حداکثر",
    rootPx: 20,
  },
];

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
const FONT_SIZE_SET = new Set<string>(FONT_SIZES);
const MAX_FONT_FAMILY_LENGTH = 120;

const FONT_SIZE_ROOT_PX = Object.fromEntries(
  FONT_SIZE_OPTIONS.map((option) => [option.value, option.rootPx])
) as Record<FontSize, number>;

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

export function sanitizeFontSize(value: unknown): FontSize {
  if (typeof value === "string" && FONT_SIZE_SET.has(value)) {
    return value as FontSize;
  }
  return DEFAULT_APPEARANCE_SETTINGS.fontSize;
}

export function getFontSizeRootPx(fontSize: FontSize): number {
  return FONT_SIZE_ROOT_PX[fontSize] ?? FONT_SIZE_ROOT_PX.medium;
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
    fontSize: sanitizeFontSize(settings.fontSize),
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
