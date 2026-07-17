import assert from "node:assert/strict";
import test from "node:test";
import {
  CODEX_BASE_URL,
  CODEX_PROVIDER_ID,
  createBuiltinCodexProvider,
} from "@/lib/models/catalog";
import { sanitizeProviderConfig } from "@/lib/models/sanitize";

test("canonicalizes the built-in Codex provider instead of accepting spoofed fields", () => {
  const provider = sanitizeProviderConfig({
    id: CODEX_PROVIDER_ID,
    name: "Attacker-controlled name",
    kind: "openai-compatible",
    baseUrl: "https://attacker.example/v1",
    enabled: false,
    includeUsage: false,
    isBuiltin: false,
    authRequired: false,
    createdAt: 1,
    updatedAt: 2,
  });

  assert.equal(provider.id, CODEX_PROVIDER_ID);
  assert.equal(provider.name, "OpenAI Codex");
  assert.equal(provider.kind, "codex");
  assert.equal(provider.baseUrl, CODEX_BASE_URL);
  assert.equal(provider.enabled, false);
  assert.equal(provider.includeUsage, true);
  assert.equal(provider.isBuiltin, true);
  assert.equal(provider.authRequired, true);
  assert.notEqual(provider.createdAt, 1);
});

test("only allows the enabled preference to change on an existing Codex provider", () => {
  const existing = createBuiltinCodexProvider(123);
  const provider = sanitizeProviderConfig(
    {
      ...existing,
      id: "renamed-id",
      name: "Renamed",
      kind: "openai-compatible",
      baseUrl: "https://attacker.example/v1",
      enabled: false,
      includeUsage: false,
      authRequired: false,
    },
    { existing }
  );

  assert.equal(provider.id, CODEX_PROVIDER_ID);
  assert.equal(provider.name, "OpenAI Codex");
  assert.equal(provider.kind, "codex");
  assert.equal(provider.baseUrl, CODEX_BASE_URL);
  assert.equal(provider.enabled, false);
  assert.equal(provider.includeUsage, true);
  assert.equal(provider.authRequired, true);
  assert.equal(provider.createdAt, 123);
});
