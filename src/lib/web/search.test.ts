import assert from "node:assert/strict";
import test from "node:test";
import { parseDuckDuckGoResults, searchDuckDuckGo } from "./search";

const RESULTS_HTML = `
  <div class="result results_links">
    <a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Farticle">Example &amp; result</a>
    <a class="result__snippet">A useful <b>summary</b>.</a>
  </div>
  <div class="result results_links">
    <a href="https://www.example.org/" class="result__a">Second result</a>
    <span class="result__snippet">Another summary.</span>
  </div>`;

test("parseDuckDuckGoResults extracts titles, destinations, and snippets", () => {
  assert.deepEqual(parseDuckDuckGoResults(RESULTS_HTML), [
    {
      title: "Example & result",
      url: "https://example.com/article",
      snippet: "A useful summary.",
    },
    {
      title: "Second result",
      url: "https://www.example.org/",
      snippet: "Another summary.",
    },
  ]);
});

test("parseDuckDuckGoResults skips unsafe result URLs", () => {
  const html = `<a class="result__a" href="http://127.0.0.1/private">Unsafe</a>`;
  assert.deepEqual(parseDuckDuckGoResults(html), []);
});

test("searchDuckDuckGo returns parsed results from its HTML endpoint", async () => {
  const response = new Response(RESULTS_HTML, { status: 200 });
  const result = await searchDuckDuckGo("test query", {
    fetchImpl: async () => response,
  });

  assert.equal(result.success, true);
  assert.equal(result.query, "test query");
  assert.equal(result.results?.length, 2);
});
