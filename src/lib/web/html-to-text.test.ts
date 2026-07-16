import assert from "node:assert/strict";
import test from "node:test";
import { decodeHtmlEntities, htmlToText } from "./html-to-text";

test("htmlToText strips tags and decodes entities", () => {
  const html = `<!doctype html><html><head><title>T</title><style>.x{}</style><script>alert(1)</script></head><body><h1>Hello &amp; world</h1><p>Line two</p></body></html>`;
  const text = htmlToText(html);
  assert.match(text, /Hello & world/);
  assert.match(text, /Line two/);
  assert.doesNotMatch(text, /alert/);
  assert.doesNotMatch(text, /<h1>/);
});

test("decodeHtmlEntities handles numeric entities", () => {
  assert.equal(decodeHtmlEntities("&#169;"), "©");
});
