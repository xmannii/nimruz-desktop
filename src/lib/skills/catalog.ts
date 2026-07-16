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
    ...lines,
  ].join("\n");
}
