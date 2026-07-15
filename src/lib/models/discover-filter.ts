export type ModelsListItem = Record<string, unknown>;

function normalizeModalities(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function readStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const items = value.filter((item): item is string => typeof item === "string");
  return items.length > 0 ? items : null;
}

export function extractModelListItems(payload: unknown): ModelsListItem[] {
  if (!payload || typeof payload !== "object") return [];

  const root = payload as Record<string, unknown>;
  const list = Array.isArray(root.data)
    ? root.data
    : Array.isArray(root.models)
      ? root.models
      : Array.isArray(payload)
        ? payload
        : [];

  return list.filter(
    (item): item is ModelsListItem => !!item && typeof item === "object"
  );
}

export function extractModelId(item: ModelsListItem): string | null {
  const id = item.id ?? item.model;
  if (typeof id !== "string" || !id.trim()) return null;
  return id.trim().slice(0, 256);
}

function matchesNonChatModelHeuristic(
  modelId: string,
  item: ModelsListItem
): boolean {
  const name = typeof item.name === "string" ? item.name : "";
  const description =
    typeof item.description === "string" ? item.description : "";
  const haystack = `${modelId} ${name} ${description}`.toLowerCase();

  const patterns = [
    /\btext-embedding[-/]/,
    /\bembed(?:ding)?s?\b/,
    /(?:^|[-_/])embed(?:ding)?(?:$|[-_/])/,
    /\bwhisper\b/,
    /\btts[-/]/,
    /\bdall[-_]?e\b/,
    /\bgpt[-_]?image\b/,
    /\bstable[-_]?diffusion\b/,
    /\bflux[-/]/,
    /\bsdxl\b/,
    /\bimagen[-/]/,
    /\brerank(?:er)?\b/,
    /\bmoderation\b/,
    /\bvoice[-_]?preview\b/,
    /\baudio[-_]?preview\b/,
    /\bspeech[-_]?to[-_]?text\b/,
    /\btext[-_]?to[-_]?speech\b/,
    /(?:^|[-_/])(?:image[-_]?gen|image[-_]?generation|text[-_]?to[-_]?image)(?:$|[-_/])/,
  ];

  if (patterns.some((pattern) => pattern.test(haystack))) {
    return true;
  }

  const id = modelId.toLowerCase();
  if (/-image(?:-preview|-mini|-\d)?$/i.test(id)) {
    return true;
  }

  return false;
}

export function isChatCompletionDiscoverableModel(
  item: ModelsListItem,
  modelId: string
): boolean {
  const architecture = item.architecture;
  if (architecture && typeof architecture === "object") {
    const arch = architecture as ModelsListItem;
    const outputs = normalizeModalities(arch.output_modalities);
    if (outputs.length > 0) {
      if (!outputs.includes("text")) return false;
      if (outputs.includes("image")) return false;
      return true;
    }

    const modality =
      typeof arch.modality === "string" ? arch.modality.toLowerCase() : "";
    if (modality) {
      if (modality.endsWith("->text+image")) return false;
      if (modality.includes("->image") && !modality.endsWith("->text")) {
        return false;
      }
      if (modality.includes("->text")) return true;
    }
  }

  const endpoints = readStringArray(item.supported_endpoints);
  if (endpoints) {
    return endpoints.some(
      (endpoint) =>
        /chat\s*completions?/i.test(endpoint) ||
        endpoint === "/v1/chat/completions" ||
        endpoint === "chat.completions"
    );
  }

  const objectType =
    typeof item.object === "string" ? item.object.toLowerCase() : "";
  if (objectType.includes("embedding")) return false;

  const type = typeof item.type === "string" ? item.type.toLowerCase() : "";
  if (
    type === "embeddings" ||
    type === "embedding" ||
    type === "image" ||
    type === "audio"
  ) {
    return false;
  }

  const capabilities = item.capabilities;
  if (capabilities && typeof capabilities === "object") {
    const caps = capabilities as ModelsListItem;
    if (caps.chat_completion === false) return false;
    if (caps.embeddings === true && caps.chat_completion !== true) return false;
    if (caps.chat_completion === true) return true;
  }

  const details = item.details;
  if (details && typeof details === "object") {
    const families = (details as ModelsListItem).families;
    if (Array.isArray(families)) {
      const lower = families.map((family) => String(family).toLowerCase());
      if (lower.includes("embed") || lower.includes("embedding")) return false;
    }
  }

  return !matchesNonChatModelHeuristic(modelId, item);
}
