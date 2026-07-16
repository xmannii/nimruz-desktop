import type { SkillSummary } from "@/lib/skills/types";

export type SkillCatalogEntry = {
  name: string;
  description: string;
};

export function toSkillCatalog(
  skills: Array<Pick<SkillSummary, "name" | "description" | "enabled">>
): SkillCatalogEntry[] {
  return skills
    .filter((skill) => skill.enabled)
    .map((skill) => ({
      name: skill.name,
      description: skill.description,
    }));
}

export function buildSkillsAppendix(
  skills: SkillCatalogEntry[] | undefined
): string {
  if (!skills?.length) return "";

  const lines = skills.map(
    (skill) => `- \`${skill.name}\`: ${skill.description}`
  );

  return [
    "## Available skills",
    "",
    "These skills are installed and enabled. Use `load_skill` with the skill name when the task matches a skill description. Only name and description are listed here — load the full instructions before following a skill.",
    "",
    ...lines,
  ].join("\n");
}
