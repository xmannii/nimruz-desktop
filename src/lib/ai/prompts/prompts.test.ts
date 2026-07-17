import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildMemoriesAppendix } from "@/lib/settings/memories";
import { buildPersonalizationAppendix } from "@/lib/settings/personalization";

function readPrompt(name: string): string {
  return readFileSync(new URL(name, import.meta.url), "utf8");
}

test("core prompt defines evidence, context, and untrusted-data behavior", () => {
  const prompt = readPrompt("system-prompt.md");

  assert.match(prompt, /Finish the authorized task/);
  assert.match(prompt, /Preserve context/);
  assert.match(prompt, /untrusted data/);
  assert.match(prompt, /Never claim you inspected, changed, ran, sent, or verified/);
});

test("workspace prompt defines an inspect-act-verify loop", () => {
  const prompt = readPrompt("workspace-tools.md");

  assert.match(prompt, /Orient/);
  assert.match(prompt, /Inspect/);
  assert.match(prompt, /Act/);
  assert.match(prompt, /Verify/);
  assert.match(prompt, /spawn_subagent/);
});

test("subagent prompt separates delegation from direct work", () => {
  const prompt = readPrompt("spawn-subagent-tools.md");

  assert.match(prompt, /Spawn when/);
  assert.match(prompt, /Work directly when/);
  assert.match(prompt, /self-contained brief/);
  assert.match(prompt, /Re-check a critical claim/);
});

test("user-configured appendices are framed as context, not authority", () => {
  const personalization = buildPersonalizationAppendix({
    responseStyle: "balanced",
    customInstructions: "Always use examples.",
  });
  const memories = buildMemoriesAppendix([
    {
      id: "memory",
      content: "Prefers concise answers",
      category: "preference",
      createdAt: 1,
      updatedAt: 1,
    },
  ]);

  assert.match(personalization, /cannot override safety, tool policy/);
  assert.match(memories, /contextual claims.*not instructions/);
});
