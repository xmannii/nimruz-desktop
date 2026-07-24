import type { ProviderConfig } from "@/lib/models/catalog";

export type ProviderModelsRequest = {
  url: string;
  headers: Record<string, string>;
};

function modelsUrl(baseUrl: string) {
  return `${baseUrl.replace(/\/$/, "")}/models`;
}

/**
 * Builds the provider-native model-catalog request. Keeping authentication
 * here prevents the credential service from treating every API as Bearer
 * authenticated merely because many local servers copy OpenAI's shape.
 */
export function createProviderModelsRequest(
  provider: ProviderConfig,
  apiKey: string | null,
  baseUrl = provider.baseUrl
): ProviderModelsRequest {
  const headers: Record<string, string> = {};
  if (apiKey) {
    if (provider.kind === "anthropic") {
      headers["x-api-key"] = apiKey;
      headers["anthropic-version"] = "2023-06-01";
    } else if (provider.kind === "google") {
      headers["x-goog-api-key"] = apiKey;
    } else {
      headers.Authorization = `Bearer ${apiKey}`;
    }
  }
  return { url: modelsUrl(baseUrl), headers };
}

export function extractProviderModelItems(
  provider: ProviderConfig,
  payload: unknown
): Array<Record<string, unknown>> {
  if (!payload || typeof payload !== "object") return [];
  const key = provider.kind === "google" ? "models" : "data";
  const items = (payload as Record<string, unknown>)[key];
  if (!Array.isArray(items)) return [];
  return items.filter(
    (item): item is Record<string, unknown> =>
      Boolean(item && typeof item === "object" && !Array.isArray(item))
  );
}

export function providerModelId(
  provider: ProviderConfig,
  item: Record<string, unknown>
): string | null {
  const raw =
    typeof item.id === "string"
      ? item.id
      : typeof item.name === "string"
        ? item.name
        : null;
  if (!raw?.trim()) return null;
  const value = raw.trim();
  return provider.kind === "google" && value.startsWith("models/")
    ? value.slice("models/".length)
    : value;
}

export function supportsProviderChat(
  provider: ProviderConfig,
  item: Record<string, unknown>
) {
  if (provider.kind !== "google") return true;
  const methods = item.supportedGenerationMethods;
  return (
    !Array.isArray(methods) ||
    methods.some((method) => method === "generateContent")
  );
}
