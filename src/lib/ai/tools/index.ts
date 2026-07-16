import { memoryTools } from "./memory";
import { expertManagementTools } from "./expert-management";
import { skillTools } from "./skill";
import { webTools } from "./web";
import type { ToolSet } from "ai";

export { memoryTools } from "./memory";
export { expertManagementTools } from "./expert-management";
export { skillTools } from "./skill";
export { webTools } from "./web";
export { createExpertTools, expertToolName } from "./expert-delegation";

/** Client-handled tools always available in chat. */
export const clientSideTools = {
  ...memoryTools,
  ...expertManagementTools,
};

type BuildChatToolsOptions = {
  skillsRuntime?: {
    loadSkillContent: (name: string) => Promise<string | null>;
  };
  includeSkills: boolean;
};

/** Base chat tools registered on every request; skills added only when installed. */
export function buildChatTools({ skillsRuntime, includeSkills }: BuildChatToolsOptions): ToolSet {
  const tools = {
    ...clientSideTools,
    ...webTools,
  } as ToolSet;

  if (includeSkills) {
    tools.load_skill = {
      ...skillTools.load_skill,
      execute: async ({ name }: { name: string }) => {
        if (!skillsRuntime) {
          return {
            success: false,
            error: "Skills are not available in this session.",
          };
        }

        const content = await skillsRuntime.loadSkillContent(name);
        if (!content) {
          return {
            success: false,
            error: `Skill "${name}" was not found or is disabled.`,
          };
        }

        return {
          success: true,
          name,
          content,
        };
      },
    };
  }

  return tools;
}
