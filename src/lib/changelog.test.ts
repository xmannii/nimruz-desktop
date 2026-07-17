import assert from "node:assert/strict";
import test from "node:test";
import {
  entryHighlights,
  entriesNewerThan,
  findChangelogEntry,
  parseChangelog,
} from "./changelog";

const SAMPLE = `# Changelog

## [1.0.0] — 2026-07-17

### Highlights

- Big feature
- Another feature

### Notes

- Note line

## [0.3.1] — 2026-07-16

### Highlights

- Small fix

## [0.2.0]

- Skills

[1.0.0]: https://example.com/1.0.0
[0.3.1]: https://example.com/0.3.1
`;

test("parseChangelog extracts version entries newest first", () => {
  const entries = parseChangelog(SAMPLE);
  assert.equal(entries.length, 3);
  assert.equal(entries[0]?.version, "1.0.0");
  assert.equal(entries[0]?.date, "2026-07-17");
  assert.match(entries[0]?.body ?? "", /Big feature/);
  assert.equal(entries[1]?.version, "0.3.1");
  assert.equal(entries[2]?.version, "0.2.0");
  assert.equal(entries[2]?.date, null);
  assert.doesNotMatch(entries[2]?.body ?? "", /https:\/\/example.com/);
});

test("entriesNewerThan filters by semver", () => {
  const entries = parseChangelog(SAMPLE);
  const newer = entriesNewerThan(entries, "0.3.1");
  assert.deepEqual(
    newer.map((entry) => entry.version),
    ["1.0.0"]
  );
  assert.deepEqual(
    entriesNewerThan(entries, "0.2.0").map((entry) => entry.version),
    ["1.0.0", "0.3.1"]
  );
});

test("entryHighlights prefers the Highlights section", () => {
  const body = parseChangelog(SAMPLE)[0]?.body ?? "";
  const highlights = entryHighlights(body);
  assert.match(highlights, /Big feature/);
  assert.doesNotMatch(highlights, /Note line/);
});

test("entryHighlights accepts Persian section headings", () => {
  const highlights = entryHighlights(
    "### چی جدیده؟\n\n- 🎉 ویژگی مهم\n\n### یادداشت\n\n- جزئیات"
  );
  assert.match(highlights, /ویژگی مهم/);
  assert.doesNotMatch(highlights, /جزئیات/);
});

test("entryHighlights falls back to full body", () => {
  assert.equal(entryHighlights("- just a bullet"), "- just a bullet");
});

test("findChangelogEntry matches normalized versions", () => {
  const entries = parseChangelog(SAMPLE);
  assert.equal(findChangelogEntry(entries, "v1.0.0")?.version, "1.0.0");
  assert.equal(findChangelogEntry(entries, "9.9.9"), null);
});
