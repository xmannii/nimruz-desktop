import { buildMemoriesAppendix } from "@/lib/settings/memories";
import { buildPersonalizationAppendix } from "@/lib/settings/personalization";
import {
  buildSkillsAppendix,
  type SkillCatalogEntry,
} from "@/lib/skills/catalog";
import { buildExpertsAppendix, sanitizeExperts } from "@/lib/settings/experts";
import systemPromptMd from "@/lib/ai/prompts/system-prompt.md";
import memoryToolsMd from "@/lib/ai/prompts/memory-tools.md";
import createExpertToolsMd from "@/lib/ai/prompts/create-expert-tools.md";
import expertToolsMd from "@/lib/ai/prompts/expert-tools.md";
import skillToolsMd from "@/lib/ai/prompts/skill-tools.md";
import webToolsMd from "@/lib/ai/prompts/web-tools.md";

export function getBaseSystemPrompt() {
  return systemPromptMd.trim();
}

export function getMemoryToolsPrompt() {
  return memoryToolsMd.trim();
}

export function getCreateExpertToolsPrompt() {
  return createExpertToolsMd.trim();
}

export function getExpertToolsPrompt() {
  return expertToolsMd.trim();
}

export function getSkillToolsPrompt() {
  return skillToolsMd.trim();
}

export function getWebToolsPrompt() {
  return webToolsMd.trim();
}

export function buildSystemInstructions(
  personalization?: unknown,
  memories?: unknown,
  experts?: unknown,
  skills?: SkillCatalogEntry[],
  options?: {
    includeMemoryTools?: boolean;
    includeAgentTools?: boolean;
  }
) {
  const hasExperts = sanitizeExperts(experts).some((expert) => expert.enabled);
  const hasSkills = (skills?.length ?? 0) > 0;
  const includeAgentTools = options?.includeAgentTools !== false;

  const sections = [
    getBaseSystemPrompt(),
    options?.includeMemoryTools === false ? "" : getMemoryToolsPrompt(),
    includeAgentTools ? getCreateExpertToolsPrompt() : "",
    includeAgentTools && hasExperts ? getExpertToolsPrompt() : "",
    includeAgentTools && hasExperts ? buildExpertsAppendix(experts) : "",
    includeAgentTools && hasSkills ? getSkillToolsPrompt() : "",
    includeAgentTools && hasSkills ? buildSkillsAppendix(skills) : "",
    includeAgentTools ? getWebToolsPrompt() : "",
    buildPersonalizationAppendix(personalization),
    buildMemoriesAppendix(memories),
  ].filter(Boolean);

  return sections.join("\n\n");
}
