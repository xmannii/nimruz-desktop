import assert from "node:assert/strict";
import test from "node:test";
import { computeJustifiedRows } from "./layout";

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
