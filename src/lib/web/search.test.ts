import assert from "node:assert/strict";
import test from "node:test";
import { parseDuckDuckGoHtml } from "./search";

const SAMPLE_HTML = `
<div class="results">
  <div class="result">
    <a class="result__a" href="https://duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fpage">Example Site</a>
    <a class="result__snippet">A helpful snippet about the example.</a>
  </div>
  <div class="result">
    <a class="result__a" href="https://duckduckgo.com/l/?uddg=https%3A%2F%2Fdocs.example.com%2Fguide">Docs Guide</a>
    <a class="result__snippet">Documentation overview.</a>
  </div>
</div>`;

test("parseDuckDuckGoHtml extracts titles, urls, and snippets", () => {
  const results = parseDuckDuckGoHtml(SAMPLE_HTML);
  assert.equal(results.length, 2);
  assert.equal(results[0]?.url, "https://example.com/page");
  assert.equal(results[0]?.title, "Example Site");
  assert.match(results[0]?.snippet ?? "", /helpful snippet/);
});
