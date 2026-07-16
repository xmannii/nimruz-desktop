import { SkillsSettingsSection } from "@/components/settings/skills-section";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/settings/skills")({
  component: SkillsSettingsSection,
});
