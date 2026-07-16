import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { SkillStore, dedupeSkills, type SkillRoot } from "./store";

async function withTempRoots(
  run: (roots: SkillRoot[], store: SkillStore) => Promise<void>
) {
  const base = await mkdtemp(path.join(os.tmpdir(), "nimruz-skills-"));
  const roots: SkillRoot[] = [
    {
      source: "nimruz",
      directory: path.join(base, "nimruz"),
      editable: true,
    },
    {
      source: "universal",
      directory: path.join(base, "universal"),
      editable: false,
    },
    {
      source: "agents",
      directory: path.join(base, "agents"),
      editable: false,
    },
  ];

  try {
    await run(roots, new SkillStore(roots));
  } finally {
    await rm(base, { recursive: true, force: true });
  }
}

async function writeSkill(
  rootDir: string,
  name: string,
  description: string,
  body = "Body"
) {
  const skillDir = path.join(rootDir, name);
  await mkdir(skillDir, { recursive: true });
  await writeFile(
    path.join(skillDir, "SKILL.md"),
    `---\nname: ${name}\ndescription: "${description}"\n---\n\n${body}\n`,
    "utf8"
  );
}

test("SkillStore lists and dedupes preferring nimruz", async () => {
  await withTempRoots(async (roots, store) => {
    await writeSkill(roots[0]!.directory, "shared", "From Nimruz");
    await writeSkill(roots[1]!.directory, "shared", "From universal");
    await writeSkill(roots[1]!.directory, "external", "From universal only");

    const listed = await store.list({ disabledSkillNames: ["external"] });
    assert.equal(listed.length, 2);

    const shared = listed.find((skill) => skill.name === "shared");
    assert.equal(shared?.source, "nimruz");
    assert.equal(shared?.description, "From Nimruz");
    assert.equal(shared?.editable, true);
    assert.equal(shared?.enabled, true);

    const external = listed.find((skill) => skill.name === "external");
    assert.equal(external?.enabled, false);
    assert.equal(external?.editable, false);
  });
});

test("SkillStore create update delete under nimruz root", async () => {
  await withTempRoots(async (_roots, store) => {
    await store.create({
      name: "demo-skill",
      description: "Demo description",
      body: "## Hello",
    });

    let listed = await store.list({ disabledSkillNames: [] });
    assert.equal(listed.length, 1);
    assert.equal(listed[0]?.name, "demo-skill");

    await store.update("demo-skill", {
      name: "demo-skill",
      description: "Updated description",
      body: "## Updated",
    });

    const body = await store.getSkillBody("demo-skill");
    assert.equal(body?.description, "Updated description");
    assert.match(body?.body ?? "", /Updated/);

    const content = await store.loadSkillContent("demo-skill", {
      disabledSkillNames: [],
    });
    assert.match(content ?? "", /Updated description/);

    assert.equal(
      await store.loadSkillContent("demo-skill", {
        disabledSkillNames: ["demo-skill"],
      }),
      null
    );

    await store.delete("demo-skill");
    listed = await store.list({ disabledSkillNames: [] });
    assert.equal(listed.length, 0);
  });
});

test("dedupeSkills keeps first occurrence", () => {
  const result = dedupeSkills([
    {
      name: "a",
      description: "first",
      source: "nimruz",
      directory: "/a",
      editable: true,
      skillPath: "/a/SKILL.md",
    },
    {
      name: "a",
      description: "second",
      source: "universal",
      directory: "/b",
      editable: false,
      skillPath: "/b/SKILL.md",
    },
  ]);

  assert.equal(result.length, 1);
  assert.equal(result[0]?.description, "first");
});
