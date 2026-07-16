export const SKILL_SOURCES = ["nimruz", "universal", "agents"] as const;

export type SkillSource = (typeof SKILL_SOURCES)[number];

export type SkillSummary = {
  name: string;
  description: string;
  source: SkillSource;
  directory: string;
  editable: boolean;
  enabled: boolean;
};

export type SkillDocument = {
  name: string;
  description: string;
  body: string;
};

export type SkillsPreferences = {
  disabledSkillNames: string[];
};

export const DEFAULT_SKILLS_PREFERENCES: SkillsPreferences = {
  disabledSkillNames: [],
};

export const SKILL_LIMITS = {
  name: 64,
  description: 500,
  body: 100_000,
} as const;

export const SKILL_SOURCE_LABELS: Record<SkillSource, string> = {
  nimruz: "Nimruz",
  universal: "npx skills",
  agents: "npx skills",
};
