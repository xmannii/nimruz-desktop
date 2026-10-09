import assert from "node:assert/strict";
import test from "node:test";
import {
  formatRelativeTime,
  groupStudioRuns,
  parseAspectRatio,
} from "./format";
import type { StudioItem } from "./types";

function item(id: string, createdAt: number, params: Record<string, unknown> = {}): StudioItem {
  return {
    id,
    kind: "image",
    status: "done",
    title: id,
    prompt: id,
    provider: "openrouter",
    modelId: "a/b",
    params,
    mimeType: "image/png",
    hasMedia: true,
    text: null,
    correctedText: null,
    error: null,
    cost: null,
    durationSeconds: null,
    parentId: null,
    createdAt,
    updatedAt: createdAt,
  };
}

test("groups batches into oldest-first runs ordered by batch index", () => {
  const runs = groupStudioRuns([
    item("solo", 30),
    item("b1", 20, { batchId: "batch", batchIndex: 1 }),
    item("b0", 20, { batchId: "batch", batchIndex: 0 }),
    item("old", 10),
  ]);
  assert.deepEqual(
    runs.map((run) => run.items.map((entry) => entry.id)),
    [["old"], ["b0", "b1"], ["solo"]]
  );
});

test("parses aspect ratios", () => {
  assert.equal(parseAspectRatio("16:9"), 16 / 9);
  assert.equal(parseAspectRatio("0:9"), null);
  assert.equal(parseAspectRatio("wide"), null);
});

test("formats relative times in Persian", () => {
  const now = Date.UTC(2026, 9, 9, 12);
  assert.equal(formatRelativeTime(now - 10_000, now), "همین حالا");
  assert.match(formatRelativeTime(now - 5 * 60_000, now), /۵ دقیقه پیش/);
});
