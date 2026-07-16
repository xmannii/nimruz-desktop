import { MODELS, DEFAULT_MODEL as BUILTIN_DEFAULT_MODEL } from "./index";
import type { CodexModelDescriptor } from "@/lib/codex";

export const OPENROUTER_PROVIDER_ID = "openrouter";
export const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
export const CODEX_PROVIDER_ID = "codex";
export const CODEX_BASE_URL = "codex://chatgpt";

export const PROVIDER_KINDS = [
  "openrouter",
  "openai-compatible",
  "codex",
] as const;
export type ProviderKind = (typeof PROVIDER_KINDS)[number];

export const MODEL_SOURCES = ["builtin", "discovered", "manual"] as const;
export type ModelSource = (typeof MODEL_SOURCES)[number];

export const PROVIDER_LIMITS = {
  maxProviders: 40,
  maxModelsPerProvider: 200,
  name: 80,
  modelName: 120,
  modelId: 256,
  description: 500,
  baseUrl: 500,
} as const;

export type ProviderConfig = {
  id: string;
  name: string;
  kind: ProviderKind;
  baseUrl: string;
  enabled: boolean;
  includeUsage: boolean;
  isBuiltin: boolean;
  authRequired: boolean;
  createdAt: number;
  updatedAt: number;
};

export type ModelConfig = {
  /** Stable row id, unique across providers */
  id: string;
  providerId: string;
  /** API model slug sent to the provider */
  modelId: string;
  name: string;
  fullName: string;
  description: string;
  contextLength: number;
  maxOutput: number;
  inputPricePerM: number;
  outputPricePerM: number;
  supportsImages: boolean;
  supportsTools: boolean;
  supportsReasoningEffort: boolean;
  enabled: boolean;
  isDefault: boolean;
  source: ModelSource;
  createdAt: number;
  updatedAt: number;
};

export type ProviderModelRef = {
  providerId: string;
  modelId: string;
};

export type ModelCatalogSnapshot = {
  providers: ProviderConfig[];
  models: ModelConfig[];
};

export type DiscoveredModel = {
  modelId: string;
  name?: string;
};

export type ModelDiscoveryResult = {
  ok: boolean;
  message: string;
  models: DiscoveredModel[];
  added: number;
  updated: number;
};

export type ProviderTestResult = {
  ok: boolean;
  message: string;
};

export function createBuiltinModelRowId(modelId: string) {
  return `builtin:${modelId}`;
}

export function createBuiltinOpenRouterProvider(
  now = Date.now()
): ProviderConfig {
  return {
    id: OPENROUTER_PROVIDER_ID,
    name: "OpenRouter",
    kind: "openrouter",
    baseUrl: OPENROUTER_BASE_URL,
    enabled: true,
    includeUsage: true,
    isBuiltin: true,
    authRequired: true,
    createdAt: now,
    updatedAt: now,
  };
}

export function createBuiltinCodexProvider(now = Date.now()): ProviderConfig {
  return {
    id: CODEX_PROVIDER_ID,
    name: "OpenAI Codex",
    kind: "codex",
    baseUrl: CODEX_BASE_URL,
    enabled: true,
    includeUsage: true,
    isBuiltin: true,
    authRequired: true,
    createdAt: now,
    updatedAt: now,
  };
}

function stableHash(value: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

export function createCodexModelRowId(modelId: string) {
  const readable = modelId
    .replace(/[^\w./-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 180);
  return `codex:${readable || "model"}:${stableHash(modelId)}`;
}

export function createCodexModelConfig(
  descriptor: CodexModelDescriptor,
  options?: { existing?: ModelConfig | null; now?: number }
): ModelConfig {
  const existing = options?.existing ?? null;
  const now = options?.now ?? Date.now();
  const supportsImages = descriptor.inputModalities.some(
    (modality) => modality.toLowerCase() === "image"
  );

  return {
    id: existing?.id ?? createCodexModelRowId(descriptor.model),
    providerId: CODEX_PROVIDER_ID,
    modelId: descriptor.model,
    name: descriptor.displayName || descriptor.model,
    fullName: descriptor.displayName || descriptor.model,
    description: descriptor.description,
    contextLength: existing?.contextLength ?? 0,
    maxOutput: existing?.maxOutput ?? 0,
    inputPricePerM: 0,
    outputPricePerM: 0,
    supportsImages,
    supportsTools: false,
    supportsReasoningEffort: descriptor.supportedReasoningEfforts.length > 0,
    enabled: existing?.enabled ?? true,
    isDefault: existing?.isDefault ?? false,
    source: "builtin",
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
}

export function createBuiltinOpenRouterModels(now = Date.now()): ModelConfig[] {
  return MODELS.map((model, index) => ({
    id: createBuiltinModelRowId(model.id),
    providerId: OPENROUTER_PROVIDER_ID,
    modelId: model.id,
    name: model.name,
    fullName: model.fullName,
    description: model.description,
    contextLength: model.contextLength,
    maxOutput: model.maxOutput,
    inputPricePerM: model.inputPricePerM,
    outputPricePerM: model.outputPricePerM,
    supportsImages: model.supportsImages,
    supportsTools: true,
    supportsReasoningEffort: model.supportsReasoningEffort,
    enabled: true,
    isDefault: model.id === BUILTIN_DEFAULT_MODEL,
    source: "builtin" as const,
    createdAt: now + index,
    updatedAt: now + index,
  }));
}

export function isPickableModel(
  model: ModelConfig,
  providers: ProviderConfig[]
): boolean {
  if (!model.enabled) return false;
  const provider = providers.find((item) => item.id === model.providerId);
  return Boolean(provider?.enabled);
}

export function getDefaultModelRef(
  models: ModelConfig[],
  providers: ProviderConfig[] = []
): ProviderModelRef | null {
  const enabled = models.filter((model) => isPickableModel(model, providers));
  const preferred =
    enabled.find((model) => model.isDefault) ??
    enabled.find((model) => model.modelId === BUILTIN_DEFAULT_MODEL) ??
    enabled[0];
  if (!preferred) return null;
  return { providerId: preferred.providerId, modelId: preferred.modelId };
}

export function findModelConfig(
  models: ModelConfig[],
  ref: ProviderModelRef
): ModelConfig | undefined {
  return models.find(
    (model) =>
      model.providerId === ref.providerId && model.modelId === ref.modelId
  );
}

export function groupEnabledModels(models: ModelConfig[], providers: ProviderConfig[]) {
  const enabledProviders = new Map(
    providers
      .filter((provider) => provider.enabled)
      .map((provider) => [provider.id, provider] as const)
  );

  const groups = new Map<
    string,
    { provider: ProviderConfig; models: ModelConfig[] }
  >();

  for (const model of models) {
    if (!isPickableModel(model, providers)) continue;
    const provider = enabledProviders.get(model.providerId);
    if (!provider) continue;
    const existing = groups.get(provider.id);
    if (existing) {
      existing.models.push(model);
    } else {
      groups.set(provider.id, { provider, models: [model] });
    }
  }

  return [...groups.values()].map((group) => ({
    ...group,
    models: group.models.sort((a, b) => a.fullName.localeCompare(b.fullName, "fa")),
  }));
}
