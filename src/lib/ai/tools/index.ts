import { memoryTools } from "./memory";
import { expertManagementTools } from "./expert-management";
import { askUserQuestionTools } from "./ask-user-question";
import { skillTools, type SkillsToolRuntime } from "./skill";
import { webTools } from "./web";
import type { ToolSet } from "ai";

export { memoryTools } from "./memory";
export { expertManagementTools } from "./expert-management";
export { askUserQuestionTools } from "./ask-user-question";
export { skillTools } from "./skill";
export { webTools } from "./web";
export { createExpertTools, expertToolName } from "./expert-delegation";

/** Client-handled tools always available in chat. */
export const clientSideTools = {
  ...memoryTools,
  ...expertManagementTools,
};

/** Client-handled tools only registered in plan mode. */
export const planClientTools = {
  ...askUserQuestionTools,
};

type BuildChatToolsOptions = {
  skillsRuntime?: SkillsToolRuntime;
  includeSkills: boolean;
};

/** Base tools registered on every agent request. */
export function buildChatTools({
  skillsRuntime,
  includeSkills,
}: BuildChatToolsOptions): ToolSet {
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

  const createSkill = skillsRuntime?.createSkill;
  if (createSkill) {
    tools.create_skill = {
      ...skillTools.create_skill,
      execute: async ({
        name,
        description,
        instructions,
      }: {
        name: string;
        description: string;
        instructions: string;
      }) => {
        try {
          const skill = await createSkill({
            name,
            description,
            body: instructions,
          });
          return {
            success: true,
            name: skill.name,
            description: skill.description,
            directory: skill.directory,
          };
        } catch (error) {
          return {
            success: false,
            name,
            error:
              error instanceof Error
                ? error.message
                : "Creating the skill failed.",
          };
        }
      },
    };
  }

  return tools;
}
