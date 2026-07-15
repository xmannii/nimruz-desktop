import assert from "node:assert/strict";
import test from "node:test";
import {
  createBuiltinOpenRouterModels,
  createBuiltinOpenRouterProvider,
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
