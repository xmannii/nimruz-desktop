import assert from "node:assert/strict";
import test from "node:test";
import {
  buildExpertsAppendix,
  EXPERT_LIMITS,
  expertDelegationToolName,
  findExplicitExpert,
  filterExpertSuggestions,
  getExpertSlashQuery,
  getExpertValidationErrors,
  normalizeExpertSlug,
  resolveSelectedExpert,
  sanitizeExperts,
  upsertExpert,
} from "./experts";

test("normalizes a friendly expert name into a slug", () => {
  assert.equal(normalizeExpertSlug(" /LinkedIn Post Writer "), "linkedin-post-writer");
});

test("reports incomplete experts and duplicate slugs", () => {
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

test("detects slash query at logical start for rtl input", () => {
  assert.equal(getExpertSlashQuery("  /linkedin"), "linkedin");
  assert.equal(getExpertSlashQuery("/linkedin-post"), "linkedin-post");
  assert.equal(getExpertSlashQuery("/linkedin-post hello"), null);
  assert.equal(getExpertSlashQuery("سلام /test"), null);
});

test("filters expert suggestions by slug or name", () => {
  const experts = sanitizeExperts([
    {
      id: "one",
      name: "LinkedIn Writer",
      slug: "linkedin-post",
      description: "Writes LinkedIn posts",
      instructions: "Write a natural professional post.",
      enabled: true,
      createdAt: 1,
      updatedAt: 1,
    },
    {
      id: "two",
      name: "Email Drafter",
      slug: "email",
      description: "Drafts emails",
      instructions: "Draft concise emails.",
      enabled: true,
      createdAt: 1,
      updatedAt: 1,
    },
  ]);

  assert.equal(filterExpertSuggestions(experts, "link").length, 1);
  assert.equal(filterExpertSuggestions(experts, "email").length, 1);
  assert.equal(filterExpertSuggestions(experts, null).length, 0);
});

test("resolves a selected expert slug from the composer badge", () => {
  const experts = sanitizeExperts([
    {
      id: "one",
      name: "LinkedIn Writer",
      slug: "linkedin-post",
      description: "Writes LinkedIn posts",
      instructions: "Write a natural professional post.",
      enabled: true,
      createdAt: 1,
      updatedAt: 1,
    },
    {
      id: "two",
      name: "Disabled",
      slug: "disabled",
      description: "Disabled expert",
      instructions: "Disabled.",
      enabled: false,
      createdAt: 1,
      updatedAt: 1,
    },
  ]);

  assert.equal(resolveSelectedExpert(experts, "linkedin-post")?.id, "one");
  assert.equal(resolveSelectedExpert(experts, "disabled"), null);
  assert.equal(resolveSelectedExpert(experts, "missing"), null);
});

test("rejects new experts when the max entry limit is reached", () => {
  const experts = Array.from({ length: EXPERT_LIMITS.maxEntries }, (_, index) => ({
    id: `expert-${index}`,
    name: `Expert ${index}`,
    slug: `expert-${index}`,
    description: "Test expert",
    instructions: "Do test work.",
    triggers: [] as string[],
    enabled: true,
    createdAt: index,
    updatedAt: index,
  }));

  assert.deepEqual(
    getExpertValidationErrors(
      {
        name: "Overflow",
        slug: "overflow",
        description: "Too many experts",
        instructions: "Should fail.",
      },
      experts
    ),
    [`حداکثر ${EXPERT_LIMITS.maxEntries.toLocaleString("fa-IR")} متخصص ذخیره شده است.`]
  );
});

test("buildExpertsAppendix lists delegation tool names", () => {
  const appendix = buildExpertsAppendix([
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
  ]);

  assert.match(appendix, /expert_linkedin_post/);
  assert.match(appendix, /\/linkedin-post/);
  assert.equal(expertDelegationToolName("linkedin-post"), "expert_linkedin_post");
  assert.equal(buildExpertsAppendix([]), "");
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
