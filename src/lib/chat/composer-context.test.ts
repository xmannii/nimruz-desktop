import assert from "node:assert/strict";
import test from "node:test";
import {
  applyMention,
  getMentionQuery,
  parseMentions,
  removeMention,
  splitMentionQuery,
} from "./composer-context";

test("getMentionQuery detects a trailing mention", () => {
  assert.equal(getMentionQuery("look at @src/ind"), "src/ind");
  assert.equal(getMentionQuery("start @"), "");
  assert.equal(getMentionQuery("@root"), "root");
});

test("getMentionQuery ignores completed mentions and emails", () => {
  assert.equal(getMentionQuery("done @file.txt more"), null);
  assert.equal(getMentionQuery("mail me a@b"), null);
});

test("splitMentionQuery separates directory from name filter", () => {
  assert.deepEqual(splitMentionQuery("name"), { dir: ".", name: "name" });
  assert.deepEqual(splitMentionQuery("src/lib/hel"), {
    dir: "src/lib",
    name: "hel",
  });
  assert.deepEqual(splitMentionQuery("src/"), { dir: "src", name: "" });
});

test("applyMention replaces the trailing query and adds a space", () => {
  assert.equal(applyMention("read @sr", "src/index.ts"), "read @src/index.ts ");
  assert.equal(
    applyMention("read @src/", "src/lib", { keepOpen: true }),
    "read @src/lib"
  );
});

test("parseMentions returns unique mention tokens", () => {
  assert.deepEqual(
    parseMentions("compare @a.txt and @b.txt and @a.txt again"),
    ["a.txt", "b.txt"]
  );
  assert.deepEqual(parseMentions("no mentions here"), []);
});

test("removeMention strips a specific token and tidies whitespace", () => {
  assert.equal(removeMention("use @a.txt and @b.txt", "a.txt"), "use and @b.txt");
});
