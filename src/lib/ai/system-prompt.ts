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
import workspaceToolsMd from "@/lib/ai/prompts/workspace-tools.md";

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

export function getWorkspaceToolsPrompt() {
  return workspaceToolsMd.trim();
}

/** Current date appendix in Gregorian (English) and Jalali (Persian). */
export function buildCurrentDateAppendix(now: Date = new Date()): string {
  const english = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZoneName: "short",
  }).format(now);

  const persian = new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZoneName: "short",
  }).format(now);

  const isoDate = now.toISOString().slice(0, 10);

  return [
    "## Current date",
    `- Gregorian: ${english} (${isoDate})`,
    `- Persian (Jalali): ${persian}`,
  ].join("\n");
}

export function buildSystemInstructions(
  personalization?: unknown,
  memories?: unknown,
  experts?: unknown,
  skills?: SkillCatalogEntry[]
) {
  const hasExperts = sanitizeExperts(experts).some((expert) => expert.enabled);
  const hasSkills = (skills?.length ?? 0) > 0;

  const sections = [
    getBaseSystemPrompt(),
    buildCurrentDateAppendix(),
    getMemoryToolsPrompt(),
    getCreateExpertToolsPrompt(),
    hasExperts ? getExpertToolsPrompt() : "",
    hasExperts ? buildExpertsAppendix(experts) : "",
    hasSkills ? getSkillToolsPrompt() : "",
    hasSkills ? buildSkillsAppendix(skills) : "",
    getWebToolsPrompt(),
    buildPersonalizationAppendix(personalization),
    buildMemoriesAppendix(memories),
  ].filter(Boolean);

  return sections.join("\n\n");
}
