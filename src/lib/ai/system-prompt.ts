import { buildMemoriesAppendix } from "@/lib/settings/memories";
import { buildPersonalizationAppendix } from "@/lib/settings/personalization";
import systemPromptMd from "@/lib/ai/prompts/system-prompt.md";
import memoryToolsMd from "@/lib/ai/prompts/memory-tools.md";
import { sanitizeExperts } from "@/lib/settings/experts";

export function getBaseSystemPrompt() {
  return systemPromptMd.trim();
}

export function getMemoryToolsPrompt() {
  return memoryToolsMd.trim();
}

export function buildSystemInstructions(
  personalization?: unknown,
  memories?: unknown,
  experts?: unknown
) {
  const enabledExperts = sanitizeExperts(experts).filter((expert) => expert.enabled);
  const expertsAppendix = enabledExperts.length
    ? [
        "## Available experts",
        "Delegate matching work to the available expert tool. Explicit /slug or @slug requests must use that expert. Pass a self-contained task. Use expert results to answer the user directly.",
        enabledExperts.map((expert) => `- /${expert.slug}: ${expert.description}${expert.triggers.length ? ` (signals: ${expert.triggers.join(", ")})` : ""}`).join("\n"),
      ].join("\n\n")
    : "";
  const sections = [
    getBaseSystemPrompt(),
    getMemoryToolsPrompt(),
    buildPersonalizationAppendix(personalization),
    buildMemoriesAppendix(memories),
    expertsAppendix,
  ].filter(Boolean);

  return sections.join("\n\n");
}
