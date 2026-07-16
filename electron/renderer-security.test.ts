import assert from "node:assert/strict";
import test from "node:test";
import {
  isSafeExternalHttpUrl,
  isTrustedRendererUrl,
} from "./renderer-security";

test("requires the exact trusted renderer origin", () => {
  const trusted = "http://127.0.0.1:43117/";
  assert.equal(isTrustedRendererUrl("http://127.0.0.1:43117/settings", trusted), true);
  assert.equal(isTrustedRendererUrl("http://127.0.0.1:43118/", trusted), false);
  assert.equal(isTrustedRendererUrl("http://localhost:43117/", trusted), false);
  assert.equal(
    isTrustedRendererUrl("http://127.0.0.1:43117@attacker.example/", trusted),
    false
  );
  assert.equal(isTrustedRendererUrl("https://attacker.example/", trusted), false);
  assert.equal(isTrustedRendererUrl("not a url", trusted), false);
});

test("only opens credential-free HTTP(S) URLs externally", () => {
  assert.equal(isSafeExternalHttpUrl("https://openai.com/codex"), true);
  assert.equal(isSafeExternalHttpUrl("http://example.com/"), true);
  assert.equal(isSafeExternalHttpUrl("mailto:user@example.com"), false);
  assert.equal(isSafeExternalHttpUrl("javascript:alert(1)"), false);
  assert.equal(isSafeExternalHttpUrl("https://user:pass@example.com/"), false);
  assert.equal(isSafeExternalHttpUrl("not a url"), false);
});
