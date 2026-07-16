import assert from "node:assert/strict";
import test from "node:test";
import { assertPublicHttpUrl } from "./url-policy";

test("assertPublicHttpUrl allows public https URLs", () => {
  const url = assertPublicHttpUrl("https://example.com/path");
  assert.equal(url.hostname, "example.com");
});

test("assertPublicHttpUrl blocks localhost and private networks", () => {
  assert.throws(() => assertPublicHttpUrl("http://localhost/"));
  assert.throws(() => assertPublicHttpUrl("http://127.0.0.1/"));
  assert.throws(() => assertPublicHttpUrl("http://192.168.1.1/"));
  assert.throws(() => assertPublicHttpUrl("file:///etc/passwd"));
});
