import assert from "node:assert/strict";
import test from "node:test";
import type { ChangelogEntry } from "./changelog";
import {
  LAST_SEEN_VERSION_STORAGE_KEY,
  getLastSeenVersion,
  markVersionSeen,
  resolveWhatsNewEntries,
  seedLastSeenVersionIfNeeded,
  shouldShowWhatsNew,
} from "./whats-new";

const memoryStore = new Map<string, string>();

const localStorageMock = {
  getItem(key: string) {
    return memoryStore.has(key) ? memoryStore.get(key)! : null;
  },
  setItem(key: string, value: string) {
    memoryStore.set(key, String(value));
  },
  removeItem(key: string) {
    memoryStore.delete(key);
  },
};

Object.defineProperty(globalThis, "localStorage", {
  value: localStorageMock,
  configurable: true,
});

const SAMPLE_ENTRIES: ChangelogEntry[] = [
  {
    version: "1.0.0",
    date: "2026-07-17",
    body: "### Highlights\n\n- Agentic workspaces",
  },
  {
    version: "0.3.1",
    date: "2026-07-16",
    body: "### Highlights\n\n- fetch_url",
  },
  {
    version: "0.3.0",
    date: "2026-07-16",
    body: "### Highlights\n\n- Experts",
  },
];

function clearStorage() {
  memoryStore.delete(LAST_SEEN_VERSION_STORAGE_KEY);
}

test("markVersionSeen and getLastSeenVersion round-trip", () => {
  clearStorage();
  assert.equal(getLastSeenVersion(), null);
  markVersionSeen("v1.0.0");
  assert.equal(getLastSeenVersion(), "1.0.0");
});

test("seedLastSeenVersionIfNeeded only writes once", () => {
  clearStorage();
  seedLastSeenVersionIfNeeded("0.3.1");
  assert.equal(getLastSeenVersion(), "0.3.1");
  seedLastSeenVersionIfNeeded("1.0.0");
  assert.equal(getLastSeenVersion(), "0.3.1");
});

test("shouldShowWhatsNew is true for upgrades and first marker-less launch", () => {
  clearStorage();
  assert.equal(shouldShowWhatsNew("1.0.0"), true);
  markVersionSeen("0.3.1");
  assert.equal(shouldShowWhatsNew("1.0.0"), true);
  assert.equal(shouldShowWhatsNew("0.3.1"), false);
  markVersionSeen("1.0.0");
  assert.equal(shouldShowWhatsNew("1.0.0"), false);
});

test("resolveWhatsNewEntries uses range when last-seen is known", () => {
  const entries = resolveWhatsNewEntries("1.0.0", "0.3.0", SAMPLE_ENTRIES);
  assert.deepEqual(
    entries.map((entry) => entry.version),
    ["1.0.0", "0.3.1"]
  );
});

test("resolveWhatsNewEntries falls back to current when last-seen is unknown", () => {
  const entries = resolveWhatsNewEntries("1.0.0", null, SAMPLE_ENTRIES);
  assert.deepEqual(
    entries.map((entry) => entry.version),
    ["1.0.0"]
  );
});
