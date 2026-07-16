import { buildMemoriesAppendix } from "@/lib/settings/memories";
import { buildPersonalizationAppendix } from "@/lib/settings/personalization";
import {
  buildSkillsAppendix,
  type SkillCatalogEntry,
} from "@/lib/skills/catalog";
import systemPromptMd from "@/lib/ai/prompts/system-prompt.md";
import memoryToolsMd from "@/lib/ai/prompts/memory-tools.md";
import skillToolsMd from "@/lib/ai/prompts/skill-tools.md";

export function getBaseSystemPrompt() {
  return systemPromptMd.trim();
}

export function getMemoryToolsPrompt() {
  return memoryToolsMd.trim();
}

export function getSkillToolsPrompt() {
  return skillToolsMd.trim();
}

export function buildSystemInstructions(
  personalization?: unknown,
  memories?: unknown,
  skills?: SkillCatalogEntry[]
) {
  const sections = [
    getBaseSystemPrompt(),
    getMemoryToolsPrompt(),
    getSkillToolsPrompt(),
    buildPersonalizationAppendix(personalization),
    buildMemoriesAppendix(memories),
    buildSkillsAppendix(skills),
  ].filter(Boolean);

  return sections.join("\n\n");
}
