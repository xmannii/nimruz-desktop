import assert from "node:assert/strict";
import test from "node:test";
import { normalizeSearchText } from "./search";

test("folds Arabic letter variants into Persian", () => {
  assert.equal(normalizeSearchText("كتاب علي"), normalizeSearchText("کتاب علی"));
});

test("ignores half-spaces, spaces, and diacritics", () => {
  const target = normalizeSearchText("می‌خواهم");
  assert.equal(normalizeSearchText("می خواهم"), target);
  assert.equal(normalizeSearchText("میخواهم"), target);
  assert.equal(normalizeSearchText("مُحَمَّد"), normalizeSearchText("محمد"));
});

test("treats Persian, Arabic, and Latin digits the same", () => {
  assert.equal(normalizeSearchText("۱۴۰۵"), "1405");
  assert.equal(normalizeSearchText("١٤٠٥"), "1405");
});

test("lowercases Latin text", () => {
  assert.equal(normalizeSearchText("A Cat"), "acat");
});
