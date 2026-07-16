import type { ProviderConfig } from "@/lib/models/catalog";

export function isCodexProvider(provider: ProviderConfig) {
  return provider.kind === "codex";
}

export function requiresProviderApiKey(provider: ProviderConfig) {
  return !isCodexProvider(provider) && provider.authRequired;
}
