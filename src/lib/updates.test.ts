import assert from "node:assert/strict";
import test from "node:test";
import {
  isNewerVersion,
  normalizeVersion,
  parseSemver,
  pickReleaseAsset,
} from "./updates";

test("normalizeVersion strips v prefix and pre-release metadata", () => {
  assert.equal(normalizeVersion("v1.2.3"), "1.2.3");
  assert.equal(normalizeVersion("1.2.3-beta.1"), "1.2.3");
  assert.equal(normalizeVersion(" 2.0.0+build "), "2.0.0");
});

test("parseSemver parses major.minor.patch", () => {
  assert.deepEqual(parseSemver("v0.1.0"), [0, 1, 0]);
  assert.deepEqual(parseSemver("1.2"), [1, 2, 0]);
  assert.equal(parseSemver("not-a-version"), null);
});

test("isNewerVersion compares semver correctly", () => {
  assert.equal(isNewerVersion("0.2.0", "0.1.0"), true);
  assert.equal(isNewerVersion("v0.1.1", "0.1.0"), true);
  assert.equal(isNewerVersion("0.1.0", "0.1.0"), false);
  assert.equal(isNewerVersion("0.1.0", "0.2.0"), false);
  assert.equal(isNewerVersion("1.0.0", "0.9.9"), true);
});

test("pickReleaseAsset prefers platform and arch matches", () => {
  const assets = [
    {
      name: "Nimruz-0.2.0-arm64.dmg",
      browser_download_url: "https://example.com/arm64.dmg",
    },
    {
      name: "Nimruz-0.2.0-x64.dmg",
      browser_download_url: "https://example.com/x64.dmg",
    },
    {
      name: "Nimruz-Setup-0.2.0.exe",
      browser_download_url: "https://example.com/setup.exe",
    },
    {
      name: "Nimruz-0.2.0.AppImage",
      browser_download_url: "https://example.com/app.AppImage",
    },
  ];

  assert.equal(
    pickReleaseAsset(assets, "darwin", "arm64")?.browser_download_url,
    "https://example.com/arm64.dmg"
  );
  assert.equal(
    pickReleaseAsset(assets, "darwin", "x64")?.browser_download_url,
    "https://example.com/x64.dmg"
  );
  assert.equal(
    pickReleaseAsset(assets, "win32", "x64")?.browser_download_url,
    "https://example.com/setup.exe"
  );
  assert.equal(
    pickReleaseAsset(assets, "linux", "x64")?.browser_download_url,
    "https://example.com/app.AppImage"
  );
  assert.equal(pickReleaseAsset(assets, "freebsd", "x64"), null);
});
