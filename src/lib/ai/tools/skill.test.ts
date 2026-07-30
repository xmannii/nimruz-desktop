import assert from "node:assert/strict";
import test from "node:test";
import type { SkillDocument } from "@/lib/skills";
import { buildChatTools } from "./index";
import { skillTools } from "./skill";

type ExecutableTool = {
  execute?: (
    input: Record<string, unknown>,
    options?: unknown
  ) => Promise<unknown>;
};

test("create_skill installs a sanitized SkillDocument through the runtime", async () => {
  let created: SkillDocument | null = null;
  const tools = buildChatTools({
    includeSkills: false,
    skillsRuntime: {
      loadSkillContent: async () => null,
      createSkill: async (skill) => {
        created = skill;
        return {
          name: skill.name,
          description: skill.description,
          source: "nimruz",
          directory: `/skills/${skill.name}`,
          editable: true,
          enabled: true,
        };
      },
    },
  });

  const result = await (tools.create_skill as ExecutableTool).execute?.({
    name: "release-notes",
    description: "Write release notes when the user announces a product update.",
    instructions: "# Release notes\n\nSummarize the user-visible changes.",
  });

  assert.deepEqual(created, {
    name: "release-notes",
    description: "Write release notes when the user announces a product update.",
    body: "# Release notes\n\nSummarize the user-visible changes.",
  });
  assert.deepEqual(result, {
    success: true,
    name: "release-notes",
    description: "Write release notes when the user announces a product update.",
    directory: "/skills/release-notes",
  });
});

test("create_skill returns a tool-readable collision error", async () => {
  const tools = buildChatTools({
    includeSkills: false,
    skillsRuntime: {
      loadSkillContent: async () => null,
      createSkill: async () => {
        throw new Error("A skill with this name already exists.");
      },
    },
  });

  const result = await (tools.create_skill as ExecutableTool).execute?.({
    name: "existing-skill",
    description: "Existing",
    instructions: "Keep this concise.",
  });

  assert.deepEqual(result, {
    success: false,
    name: "existing-skill",
    error: "A skill with this name already exists.",
  });
});

test("create_skill schema rejects a second frontmatter block", () => {
  const result = skillTools.create_skill.inputSchema.safeParse({
    name: "invalid-template",
    description: "Invalid",
    instructions: "---\nname: duplicate\n---\n\nDo the work.",
  });

  assert.equal(result.success, false);
});
