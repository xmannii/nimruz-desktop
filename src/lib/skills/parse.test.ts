import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSkillsAppendix,
  isValidSkillName,
  normalizeSkillName,
  parseSkillMarkdown,
  sanitizeSkillsPreferences,
  serializeSkillMarkdown,
  toSkillCatalog,
} from "./index";

test("normalizeSkillName accepts kebab-case names", () => {
  assert.equal(normalizeSkillName("my-skill"), "my-skill");
  assert.equal(normalizeSkillName(" My-Skill "), "my-skill");
  assert.equal(normalizeSkillName("bad_name"), null);
  assert.equal(normalizeSkillName("Upper Case"), null);
  assert.equal(isValidSkillName("a"), true);
});

test("parseSkillMarkdown reads frontmatter and body", () => {
  const parsed = parseSkillMarkdown(`---
name: web-design
description: "Use when designing UI"
---

## Steps

1. Start with hierarchy
`);

  assert.deepEqual(parsed, {
    name: "web-design",
    description: "Use when designing UI",
    body: "## Steps\n\n1. Start with hierarchy\n",
  });
});

test("parseSkillMarkdown rejects missing description", () => {
  assert.equal(
    parseSkillMarkdown(`---
name: incomplete
---

body
`),
    null
  );
});

test("serializeSkillMarkdown round-trips through parse", () => {
  const markdown = serializeSkillMarkdown({
    name: "note-taking",
    description: 'Capture "quotes" and notes',
    body: "Write concise notes.",
  });
  const parsed = parseSkillMarkdown(markdown);
  assert.equal(parsed?.name, "note-taking");
  assert.equal(parsed?.description, 'Capture "quotes" and notes');
  assert.match(parsed?.body ?? "", /Write concise notes/);
});

test("sanitizeSkillsPreferences dedupes disabled names", () => {
  assert.deepEqual(
    sanitizeSkillsPreferences({
      disabledSkillNames: ["a-skill", "A-Skill", "bad name", "b-skill"],
    }),
    { disabledSkillNames: ["a-skill", "b-skill"] }
  );
});

test("toSkillCatalog and buildSkillsAppendix only include enabled skills", () => {
  const catalog = toSkillCatalog([
    {
      name: "on",
      description: "Enabled skill",
      enabled: true,
    },
    {
      name: "off",
      description: "Disabled skill",
      enabled: false,
    },
  ]);

  assert.deepEqual(catalog, [{ name: "on", description: "Enabled skill" }]);

  const appendix = buildSkillsAppendix(catalog);
  assert.match(appendix, /`on`/);
  assert.doesNotMatch(appendix, /`off`/);
  assert.equal(buildSkillsAppendix([]), "");
});
