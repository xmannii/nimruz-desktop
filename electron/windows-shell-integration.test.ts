import assert from "node:assert/strict";
import test from "node:test";
import {
  parseOpenFolderArgument,
  windowsContextMenuRegistryEntries,
} from "./windows-shell-integration";

test("parses a folder passed by the Windows context-menu command", () => {
  assert.equal(
    parseOpenFolderArgument(["Nimruz.exe", "--open-folder", "C:\\code\\app"]),
    "C:\\code\\app"
  );
  assert.equal(parseOpenFolderArgument(["Nimruz.exe"]), null);
  assert.equal(
    parseOpenFolderArgument(["Nimruz.exe", "--open-folder", ""]),
    null
  );
});

test("registers background and selected-folder Windows shell verbs", () => {
  const entries = windowsContextMenuRegistryEntries("C:\\Apps\\Nimruz.exe");
  assert.equal(entries.length, 6);
  assert.ok(
    entries.some(
      (entry) =>
        entry.key.endsWith("Directory\\Background\\shell\\Nimruz\\command") &&
        entry.value.includes('"%V"')
    )
  );
  assert.ok(
    entries.some(
      (entry) =>
        entry.key.endsWith("Directory\\shell\\Nimruz\\command") &&
        entry.value.includes('"%1"')
    )
  );
});
