import assert from "node:assert/strict";
import test from "node:test";
import {
  escapeTelegramHtml,
  markdownToTelegramHtml,
  splitTelegramChunks,
} from "./telegram-format";

test("escapes Telegram HTML special characters", () => {
  assert.equal(escapeTelegramHtml(`a <b> & "c"`), `a &lt;b&gt; &amp; "c"`);
});

test("converts common Markdown to Telegram HTML", () => {
  const html = markdownToTelegramHtml(
    [
      "# Title",
      "",
      "Hello **world** and *italic* plus ~~old~~.",
      "Use `npm test` and [docs](https://example.com).",
      "",
      "```ts",
      "const n = 1 < 2;",
      "```",
    ].join("\n")
  );

  assert.match(html, /<b>Title<\/b>/);
  assert.match(html, /<b>world<\/b>/);
  assert.match(html, /<i>italic<\/i>/);
  assert.match(html, /<s>old<\/s>/);
  assert.match(html, /<code>npm test<\/code>/);
  assert.match(html, /<a href="https:\/\/example.com">docs<\/a>/);
  assert.match(
    html,
    /<pre><code class="language-ts">const n = 1 &lt; 2;<\/code><\/pre>/
  );
  assert.doesNotMatch(html, /\*\*/);
});

test("splits long Telegram payloads without cutting mid-word when possible", () => {
  const chunks = splitTelegramChunks("one two three four", 10);
  assert.deepEqual(chunks, ["one two", "three four"]);
});
