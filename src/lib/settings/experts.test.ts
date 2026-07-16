import assert from "node:assert/strict";
import test from "node:test";
import {
  findExplicitExpert,
  getExpertValidationErrors,
  normalizeExpertSlug,
  sanitizeExperts,
  upsertExpert,
} from "./experts";

test("normalizes a friendly expert name into a slash-command slug", () => {
  assert.equal(normalizeExpertSlug(" /LinkedIn Post Writer "), "linkedin-post-writer");
});

test("reports incomplete experts and duplicate slash commands", () => {
  assert.deepEqual(getExpertValidationErrors({}), [
    "نام متخصص را وارد کنید.",
    "یک دستور انگلیسی معتبر وارد کنید.",
    "کار متخصص را کوتاه توضیح دهید.",
    "روش و سبک کار متخصص را مشخص کنید.",
  ]);

  const existing = upsertExpert([], {
    name: "Writer",
    slug: "writer",
    description: "Writes posts",
    instructions: "Write concise posts.",
  });
  assert.deepEqual(
    getExpertValidationErrors(
      {
        name: "Another writer",
        slug: "writer",
        description: "Writes other posts",
        instructions: "Write other concise posts.",
      },
      existing
    ),
    ["دستور /writer قبلاً استفاده شده است."]
  );
});

test("sanitizes experts and rejects duplicate slugs", () => {
  const experts = sanitizeExperts([
    {
      id: "one",
      name: "LinkedIn Writer",
      slug: "linkedin-post",
      description: "Writes LinkedIn posts",
      instructions: "Write a natural professional post.",
      triggers: ["LinkedIn post"],
      enabled: true,
      createdAt: 1,
      updatedAt: 1,
    },
    {
      id: "two",
      name: "Duplicate",
      slug: "linkedin-post",
      description: "Duplicate",
      instructions: "Duplicate",
    },
  ]);

  assert.equal(experts.length, 1);
  assert.equal(findExplicitExpert(experts, "/linkedin-post launch update")?.id, "one");
  assert.equal(findExplicitExpert(experts, "write a post"), null);
});

test("upserts a valid expert and keeps its original creation time", () => {
  const created = upsertExpert([], {
    name: "LinkedIn Writer",
    slug: "linkedin-post",
    description: "Writes LinkedIn posts",
    instructions: "Write a natural professional post.",
  });
  const updated = upsertExpert(created, {
    ...created[0],
    description: "Writes polished LinkedIn posts",
  });

  assert.equal(updated.length, 1);
  assert.equal(updated[0].createdAt, created[0].createdAt);
  assert.equal(updated[0].description, "Writes polished LinkedIn posts");
});
