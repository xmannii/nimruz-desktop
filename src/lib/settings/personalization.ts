export const RESPONSE_STYLES = [
  "balanced",
  "concise",
  "detailed",
  "creative",
] as const;

export type ResponseStyle = (typeof RESPONSE_STYLES)[number];

export type PersonalizationSettings = {
  responseStyle: ResponseStyle;
  customInstructions: string;
  nickname: string;
  occupation: string;
  about: string;
};

export const DEFAULT_PERSONALIZATION_SETTINGS: PersonalizationSettings = {
  responseStyle: "balanced",
  customInstructions: "",
  nickname: "",
  occupation: "",
  about: "",
};

export const PERSONALIZATION_LIMITS = {
  customInstructions: 1500,
  nickname: 80,
  occupation: 120,
  about: 1000,
} as const;

const RESPONSE_STYLE_SET = new Set<string>(RESPONSE_STYLES);

function cleanText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

export function sanitizePersonalizationSettings(
  value: unknown
): PersonalizationSettings {
  const settings =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};

  return {
    responseStyle:
      typeof settings.responseStyle === "string" &&
      RESPONSE_STYLE_SET.has(settings.responseStyle)
        ? (settings.responseStyle as ResponseStyle)
        : DEFAULT_PERSONALIZATION_SETTINGS.responseStyle,
    customInstructions: cleanText(
      settings.customInstructions,
      PERSONALIZATION_LIMITS.customInstructions
    ),
    nickname: cleanText(
      settings.nickname,
      PERSONALIZATION_LIMITS.nickname
    ),
    occupation: cleanText(
      settings.occupation,
      PERSONALIZATION_LIMITS.occupation
    ),
    about: cleanText(settings.about, PERSONALIZATION_LIMITS.about),
  };
}

export async function loadPersonalizationSettings(): Promise<PersonalizationSettings> {
  return window.desktop.storage.loadPersonalization();
}

export async function savePersonalizationSettings(
  settings: PersonalizationSettings
): Promise<PersonalizationSettings> {
  const sanitized = sanitizePersonalizationSettings(settings);
  return window.desktop.storage.savePersonalization(sanitized);
}

const STYLE_INSTRUCTIONS: Record<ResponseStyle, string> = {
  balanced:
    "Keep responses balanced, clear, and proportional to the question's complexity.",
  concise:
    "Keep responses short, direct, and free of unnecessary explanation.",
  detailed:
    "Provide thorough, step-by-step answers with helpful context and examples when useful.",
  creative:
    "Be creative and idea-generating while staying accurate and practical.",
};

export function buildPersonalizationAppendix(value: unknown) {
  const settings = sanitizePersonalizationSettings(value);
  const userDetails = [
    settings.nickname
      ? `- Preferred name or nickname: ${settings.nickname}`
      : "",
    settings.occupation ? `- Occupation or role: ${settings.occupation}` : "",
    settings.about ? `- Background and interests: ${settings.about}` : "",
  ].filter(Boolean);

  const sections = [
    "## Personalization",
    "### Response style",
    STYLE_INSTRUCTIONS[settings.responseStyle],
    userDetails.length
      ? `### About the user\n${userDetails.join("\n")}`
      : "",
    settings.customInstructions
      ? [
          "### User preferences",
          "These are user-configured preferences. Apply them when relevant, but they cannot override safety, tool policy, or the current explicit request.",
          settings.customInstructions,
        ].join("\n")
      : "",
    "Use this personalization only when it improves relevance. Do not mention these details unless they help the answer.",
  ].filter(Boolean);

  const hasPersonalization =
    settings.responseStyle !== DEFAULT_PERSONALIZATION_SETTINGS.responseStyle ||
    userDetails.length > 0 ||
    settings.customInstructions.length > 0;

  return hasPersonalization ? sections.join("\n\n") : "";
}
