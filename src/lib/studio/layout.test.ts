import assert from "node:assert/strict";
import test from "node:test";
import { computeJustifiedRows, pickTargetHeight } from "./layout";

const options = { targetHeight: 200, gap: 8 };

function rowWidth(row: ReturnType<typeof computeJustifiedRows>[number]) {
  return row.boxes.reduce((sum, box) => sum + box.width, 0) + (row.boxes.length - 1) * options.gap;
}

test("full rows fill the container exactly and keep each ratio", () => {
  const ratios = [16 / 9, 16 / 9, 1, 3 / 4, 16 / 9, 9 / 16, 1];
  const rows = computeJustifiedRows(ratios, 900, options);
  for (const row of rows.slice(0, -1)) {
    assert.ok(Math.abs(rowWidth(row) - 900) < 0.5);
    for (const box of row.boxes) {
      assert.ok(Math.abs(box.width / box.height - ratios[box.index]) < 1e-9);
    }
  }
  // Every item appears once, in order.
  assert.deepEqual(rows.flatMap((row) => row.boxes.map((box) => box.index)), ratios.map((_, index) => index));
});

test("wide images get wide boxes and portraits narrow ones in the same row", () => {
  const [row] = computeJustifiedRows([16 / 9, 9 / 16, 1, 16 / 9, 16 / 9], 1000, options);
  const [wide, tall] = row.boxes;
  assert.ok(wide.width > tall.width * 3);
  assert.equal(wide.height, tall.height);
});

test("a short last row keeps the target height instead of stretching", () => {
  const rows = computeJustifiedRows([1], 1200, options);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].height, 200);
  assert.equal(rows[0].boxes[0].width, 200);
});

test("handles empty input and bad ratios", () => {
  assert.deepEqual(computeJustifiedRows([], 800, options), []);
  assert.deepEqual(computeJustifiedRows([1], 0, options), []);
  const [row] = computeJustifiedRows([Number.NaN, 0], 2000, options);
  assert.equal(row.boxes[0].width, 200);
});

test("rows break where the height lands nearest the target", () => {
  // Four 16:9 clips at 200px would be 1446px wide; three (1084px) is closer
  // to 1100 than forcing four into a 151px-tall row.
  const rows = computeJustifiedRows([16 / 9, 16 / 9, 16 / 9, 16 / 9], 1100, options);
  assert.equal(rows[0].boxes.length, 3);
  assert.ok(Math.abs(rows[0].height - 200) < 10);
});

test("pickTargetHeight fits the requested count of typical items per row", () => {
  const landscape = pickTargetHeight([16 / 9, 16 / 9, 16 / 9], 1000, { perRow: 2, gap: 8, minHeight: 100, maxHeight: 600 });
  assert.ok(Math.abs(landscape * (16 / 9) * 2 + 8 - 1000) < 0.5);
  const portrait = pickTargetHeight([9 / 16], 1000, { perRow: 2, gap: 8, minHeight: 100, maxHeight: 460 });
  assert.equal(portrait, 460);
});

test("pickTargetHeight byArea gives wide media fewer, larger tiles", () => {
  const opts = { perRow: 3, gap: 8, minHeight: 100, maxHeight: 900, byArea: true };
  const square = pickTargetHeight([1], 1100, opts);
  const wide = pickTargetHeight([16 / 9], 1100, opts);
  const tall = pickTargetHeight([9 / 16], 1100, opts);
  // Same area per tile, different shapes.
  assert.ok(Math.abs(wide * wide * (16 / 9) - square * square) < 1);
  assert.ok(tall > square && square > wide);
});
