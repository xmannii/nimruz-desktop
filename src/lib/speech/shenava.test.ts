import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeShenavaPersianNumbers,
  resamplePcm,
} from "./shenava";

test("normalizes Shenava spoken Persian numbers", () => {
  assert.equal(
    normalizeShenavaPersianNumbers("من بیست و سه فایل دارم"),
    "من ۲۳ فایل دارم"
  );
  assert.equal(
    normalizeShenavaPersianNumbers("یک میلیون و دویست هزار"),
    "۱۲۰۰۰۰۰"
  );
});

test("resamples PCM to the requested sample rate", () => {
  const source = Float32Array.from([0, 0.25, 0.5, 0.75, 1, 0.75, 0.5, 0.25]);
  const result = resamplePcm(source, 8, 4);
  assert.deepEqual(Array.from(result), [0, 0.5, 1, 0.5]);
  assert.notEqual(resamplePcm(source, 8, 8), source);
});

test("resampling normalizes invalid or out-of-range PCM samples", () => {
  const source = Float32Array.from([-2, Number.NaN, 2]);
  assert.deepEqual(Array.from(resamplePcm(source, 3, 3)), [-1, 0, 1]);
});
