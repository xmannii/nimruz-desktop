import assert from "node:assert/strict";
import test from "node:test";
import { createMission, sanitizeMissionInput } from "./types";

test("creates a durable draft mission with ordered steps", () => {
  const mission = createMission({
    title: "Organize invoices",
    goal: "Review the invoice folder and produce a report.",
    steps: [{ title: "List files" }, { title: "Create report" }],
  });
  assert.equal(mission.status, "draft");
  assert.deepEqual(mission.steps.map((step) => step.position), [0, 1]);
  assert.equal(mission.steps[0]?.missionId, mission.id);
});

test("sanitizes empty and oversized mission input", () => {
  const input = sanitizeMissionInput({ title: "  Goal  ", goal: "  Details  ", steps: [{ title: " " }, { title: "Step" }] });
  assert.deepEqual(input.steps?.map((step) => step.title), ["Step"]);
  assert.equal(input.title, "Goal");
  assert.equal(input.goal, "Details");
});
