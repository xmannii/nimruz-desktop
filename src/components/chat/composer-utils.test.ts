import assert from "node:assert/strict";
import test from "node:test";
import { getPastedFiles } from "./composer-utils";

function clipboard(files: File[], text = "") {
  return {
    files: files as unknown as FileList,
    getData: (format: string) => (format === "text/plain" ? text : ""),
  };
}

const now = new Date("2026-10-05T14:03:09.123Z");

test("renames generic clipboard screenshots with a timestamp", () => {
  const [file] = getPastedFiles(
    clipboard([new File(["x"], "image.png", { type: "image/png" })]),
    now
  );
  assert.equal(file.name, "pasted-image-20261005-140309.png");
  assert.equal(file.type, "image/png");
});

test("numbers multiple pasted images and keeps real file names", () => {
  const files = getPastedFiles(
    clipboard([
      new File(["a"], "image.png", { type: "image/png" }),
      new File(["b"], "image.jpeg", { type: "image/jpeg" }),
      new File(["c"], "diagram.png", { type: "image/png" }),
    ]),
    now
  );
  assert.deepEqual(
    files.map((file) => file.name),
    [
      "pasted-image-20261005-140309-1.png",
      "pasted-image-20261005-140309-2.jpeg",
      "diagram.png",
    ]
  );
});

test("ignores pastes that carry plain text or no files", () => {
  assert.deepEqual(getPastedFiles(clipboard([]), now), []);
  assert.deepEqual(
    getPastedFiles(
      clipboard([new File(["x"], "image.png", { type: "image/png" })], "hello"),
      now
    ),
    []
  );
});
