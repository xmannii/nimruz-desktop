import {
  DEFAULT_SKILLS_PREFERENCES,
  type SkillsPreferences,
} from "@/lib/skills/types";
import { normalizeSkillName } from "@/lib/skills/parse";

export function sanitizeSkillsPreferences(
  value: unknown
): SkillsPreferences {
  if (!value || typeof value !== "object") {
    return { ...DEFAULT_SKILLS_PREFERENCES };
  }

  const entry = value as Record<string, unknown>;
  const raw = entry.disabledSkillNames;
  if (!Array.isArray(raw)) {
    return { ...DEFAULT_SKILLS_PREFERENCES };
  }

  const seen = new Set<string>();
  const disabledSkillNames: string[] = [];

  for (const item of raw) {
    const name = normalizeSkillName(item);
    if (!name || seen.has(name)) continue;
    seen.add(name);
    disabledSkillNames.push(name);
  }

  return { disabledSkillNames };
}

export function isSkillEnabled(
  name: string,
  preferences: SkillsPreferences
) {
  return !preferences.disabledSkillNames.includes(name);
}
