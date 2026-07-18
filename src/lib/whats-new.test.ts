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
const durableStore = new Map<string, string>();

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

Object.defineProperty(globalThis, "window", {
  value: {
    desktop: {
      storage: {
        async loadLastSeenVersion() {
          return durableStore.get("last-seen-version") ?? null;
        },
        async saveLastSeenVersion(version: string) {
          durableStore.set("last-seen-version", version);
        },
      },
    },
  },
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
  durableStore.clear();
}

test("markVersionSeen and getLastSeenVersion round-trip via durable storage", async () => {
  clearStorage();
  assert.equal(await getLastSeenVersion(), null);
  await markVersionSeen("v1.0.0");
  assert.equal(await getLastSeenVersion(), "1.0.0");
  assert.equal(durableStore.get("last-seen-version"), "1.0.0");
});

test("getLastSeenVersion migrates legacy localStorage into durable storage", async () => {
  clearStorage();
  memoryStore.set(LAST_SEEN_VERSION_STORAGE_KEY, "0.3.1");
  assert.equal(await getLastSeenVersion(), "0.3.1");
  assert.equal(durableStore.get("last-seen-version"), "0.3.1");
});

test("seedLastSeenVersionIfNeeded only writes once", async () => {
  clearStorage();
  await seedLastSeenVersionIfNeeded("0.3.1");
  assert.equal(await getLastSeenVersion(), "0.3.1");
  await seedLastSeenVersionIfNeeded("1.0.0");
  assert.equal(await getLastSeenVersion(), "0.3.1");
});

test("shouldShowWhatsNew is true for upgrades and first marker-less launch", async () => {
  clearStorage();
  assert.equal(await shouldShowWhatsNew("1.0.0"), true);
  await markVersionSeen("0.3.1");
  assert.equal(await shouldShowWhatsNew("1.0.0"), true);
  assert.equal(await shouldShowWhatsNew("0.3.1"), false);
  await markVersionSeen("1.0.0");
  assert.equal(await shouldShowWhatsNew("1.0.0"), false);
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
