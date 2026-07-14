import { buildMemoriesAppendix } from "@/lib/settings/memories";
import { buildPersonalizationAppendix } from "@/lib/settings/personalization";
import systemPromptMd from "@/lib/ai/prompts/system-prompt.md";
import memoryToolsMd from "@/lib/ai/prompts/memory-tools.md";

export function getBaseSystemPrompt() {
  return systemPromptMd.trim();
}

export function getMemoryToolsPrompt() {
  return memoryToolsMd.trim();
}

export function buildSystemInstructions(
  personalization?: unknown,
  memories?: unknown
) {
  const sections = [
    getBaseSystemPrompt(),
    getMemoryToolsPrompt(),
    buildPersonalizationAppendix(personalization),
    buildMemoriesAppendix(memories),
  ].filter(Boolean);

  return sections.join("\n\n");
}
