import assert from "node:assert/strict";
import test from "node:test";
import {
  CODEX_BASE_URL,
  CODEX_PROVIDER_ID,
  createBuiltinCodexProvider,
  createBuiltinOpenRouterModels,
  createBuiltinOpenRouterProvider,
  createCodexModelConfig,
  createCodexModelRowId,
  groupEnabledModels,
  isPickableModel,
  OPENROUTER_PROVIDER_ID,
} from "@/lib/models/catalog";

test("groupEnabledModels hides models from disabled providers", () => {
  const provider = {
    ...createBuiltinOpenRouterProvider(),
    enabled: false,
  };
  const models = createBuiltinOpenRouterModels().map((model) => ({
    ...model,
    enabled: true,
  }));

  const groups = groupEnabledModels(models, [provider]);
  assert.equal(groups.length, 0);
});

test("isPickableModel requires an enabled provider and model", () => {
  const provider = {
    ...createBuiltinOpenRouterProvider(),
    enabled: false,
  };
  const model = { ...createBuiltinOpenRouterModels()[0]!, enabled: true };

  assert.equal(isPickableModel(model, [provider]), false);
  assert.equal(
    isPickableModel(model, [{ ...provider, enabled: true }]),
    true
  );
});

test("groupEnabledModels keeps enabled models for enabled providers", () => {
  const provider = createBuiltinOpenRouterProvider();
  const models = createBuiltinOpenRouterModels().map((model, index) => ({
    ...model,
    enabled: index === 0,
  }));

  const groups = groupEnabledModels(models, [provider]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0]?.provider.id, OPENROUTER_PROVIDER_ID);
  assert.equal(groups[0]?.models.length, 1);
});

test("creates an immutable built-in Codex subscription provider", () => {
  const provider = createBuiltinCodexProvider(1234);
  assert.deepEqual(provider, {
    id: CODEX_PROVIDER_ID,
    name: "OpenAI Codex",
    kind: "codex",
    baseUrl: CODEX_BASE_URL,
    enabled: true,
    includeUsage: true,
    isBuiltin: true,
    authRequired: true,
    createdAt: 1234,
    updatedAt: 1234,
  });
});

test("creates stable, bounded, collision-resistant Codex model row ids", () => {
  const first = createCodexModelRowId("gpt-5/codex preview");
  assert.equal(first, createCodexModelRowId("gpt-5/codex preview"));
  assert.notEqual(first, createCodexModelRowId("gpt-5/codex-preview"));
  assert.match(first, /^codex:[\w./-]+:[a-z0-9]+$/);
  assert.ok(createCodexModelRowId("x".repeat(500)).length <= 256);
});

test("maps Codex model capabilities without representing subscription use as token cost", () => {
  const model = createCodexModelConfig(
    {
      id: "server-id",
      model: "gpt-5-codex",
      displayName: "GPT-5 Codex",
      description: "Coding model",
      isDefault: true,
      inputModalities: ["text", "IMAGE"],
      supportedReasoningEfforts: ["low", "high"],
    },
    { now: 2000 }
  );

  assert.equal(model.providerId, CODEX_PROVIDER_ID);
  assert.equal(model.modelId, "gpt-5-codex");
  assert.equal(model.name, "GPT-5 Codex");
  assert.equal(model.source, "builtin");
  assert.equal(model.supportsImages, true);
  assert.equal(model.supportsReasoningEffort, true);
  assert.equal(model.supportsTools, false);
  assert.equal(model.inputPricePerM, 0);
  assert.equal(model.outputPricePerM, 0);
  assert.equal(model.createdAt, 2000);
  assert.equal(model.updatedAt, 2000);
});

test("refreshing a Codex descriptor preserves local picker preferences", () => {
  const existing = {
    ...createCodexModelConfig({
      id: "old-server-id",
      model: "gpt-5-codex",
      displayName: "Old name",
      description: "Old description",
      isDefault: false,
      inputModalities: ["text"],
      supportedReasoningEfforts: [],
    }),
    enabled: false,
    isDefault: true,
    contextLength: 123_456,
    maxOutput: 8_192,
    createdAt: 100,
  };

  const refreshed = createCodexModelConfig(
    {
      id: "new-server-id",
      model: "gpt-5-codex",
      displayName: "New name",
      description: "New description",
      isDefault: true,
      inputModalities: ["text", "image"],
      supportedReasoningEfforts: ["medium"],
    },
    { existing, now: 300 }
  );

  assert.equal(refreshed.id, existing.id);
  assert.equal(refreshed.enabled, false);
  assert.equal(refreshed.isDefault, true);
  assert.equal(refreshed.contextLength, 123_456);
  assert.equal(refreshed.maxOutput, 8_192);
  assert.equal(refreshed.createdAt, 100);
  assert.equal(refreshed.name, "New name");
  assert.equal(refreshed.supportsImages, true);
  assert.equal(refreshed.updatedAt, 300);
});

test("groups dynamically synchronized Codex models under the subscription provider", () => {
  const provider = createBuiltinCodexProvider();
  const model = createCodexModelConfig({
    id: "server-id",
    model: "gpt-5-codex",
    displayName: "GPT-5 Codex",
    description: "",
    isDefault: false,
    inputModalities: ["text"],
    supportedReasoningEfforts: ["medium"],
  });

  const groups = groupEnabledModels([model], [provider]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0]?.provider.id, CODEX_PROVIDER_ID);
  assert.equal(groups[0]?.models[0]?.modelId, "gpt-5-codex");
});
