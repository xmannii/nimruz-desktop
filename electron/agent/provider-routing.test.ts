import assert from "node:assert/strict";
import test from "node:test";
import {
  createBuiltinCodexProvider,
  createBuiltinOpenRouterProvider,
} from "@/lib/models/catalog";
import {
  isCodexProvider,
  requiresProviderApiKey,
} from "./provider-routing";

test("routes Codex separately without requiring an API key", () => {
  const codex = createBuiltinCodexProvider();
  assert.equal(isCodexProvider(codex), true);
  assert.equal(requiresProviderApiKey(codex), false);

  const openrouter = createBuiltinOpenRouterProvider();
  assert.equal(isCodexProvider(openrouter), false);
  assert.equal(requiresProviderApiKey(openrouter), true);
});
