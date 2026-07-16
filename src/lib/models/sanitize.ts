import {
  CODEX_BASE_URL,
  CODEX_PROVIDER_ID,
  OPENROUTER_BASE_URL,
  OPENROUTER_PROVIDER_ID,
  PROVIDER_KINDS,
  PROVIDER_LIMITS,
  MODEL_SOURCES,
  type ModelConfig,
  type ModelSource,
  type ProviderConfig,
  type ProviderKind,
} from "./catalog";

const PROVIDER_KIND_SET = new Set<string>(PROVIDER_KINDS);
const MODEL_SOURCE_SET = new Set<string>(MODEL_SOURCES);

function isId(value: unknown): value is string {
  return typeof value === "string" && /^[\w-]{1,128}$/.test(value);
}

function isModelRowId(value: unknown): value is string {
  return typeof value === "string" && /^[\w.:/-]{1,256}$/.test(value);
}

function cleanText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function asFiniteNumber(value: unknown, fallback = 0) {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function asBoolean(value: unknown, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

function isPrivateOrLocalHostname(hostname: string) {
  const host = hostname.toLowerCase();
  if (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "::1" ||
    host === "[::1]" ||
    host.endsWith(".local")
  ) {
    return true;
  }

  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
  return false;
}

export function normalizeBaseUrl(value: unknown): string {
  const raw = cleanText(value, PROVIDER_LIMITS.baseUrl);
  if (!raw) {
    throw new Error("آدرس پایه الزامی است.");
  }

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("آدرس پایه نامعتبر است.");
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("فقط http و https پشتیبانی می‌شود.");
  }

  if (url.protocol === "http:" && !isPrivateOrLocalHostname(url.hostname)) {
    throw new Error(
      "آدرس‌های http فقط برای localhost و شبکه‌های خصوصی مجاز هستند."
    );
  }

  url.hash = "";
  let pathname = url.pathname.replace(/\/+$/, "");
  if (!pathname || pathname === "/") {
    pathname = "/v1";
  }
  url.pathname = pathname;
  return url.toString().replace(/\/$/, "");
}

export function sanitizeProviderConfig(
  value: unknown,
  options?: { existing?: ProviderConfig | null }
): ProviderConfig {
  if (!value || typeof value !== "object") {
    throw new Error("پیکربندی ارائه‌دهنده نامعتبر است.");
  }

  const input = value as Partial<ProviderConfig>;
  const existing = options?.existing ?? null;
  const now = Date.now();

  if (!isId(input.id)) {
    throw new Error("شناسه ارائه‌دهنده نامعتبر است.");
  }

  const kind = (
    typeof input.kind === "string" && PROVIDER_KIND_SET.has(input.kind)
      ? input.kind
      : existing?.kind
  ) as ProviderKind | undefined;

  if (!kind) {
    throw new Error("نوع ارائه‌دهنده نامعتبر است.");
  }

  if (
    existing?.isBuiltin ||
    input.id === OPENROUTER_PROVIDER_ID ||
    input.id === CODEX_PROVIDER_ID
  ) {
    if (existing?.kind === "codex" || input.id === CODEX_PROVIDER_ID) {
      return {
        id: CODEX_PROVIDER_ID,
        name: "OpenAI Codex",
        kind: "codex",
        baseUrl: CODEX_BASE_URL,
        enabled: asBoolean(input.enabled, existing?.enabled ?? true),
        includeUsage: true,
        isBuiltin: true,
        authRequired: true,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      };
    }

    return {
      id: OPENROUTER_PROVIDER_ID,
      name: "OpenRouter",
      kind: "openrouter",
      baseUrl: OPENROUTER_BASE_URL,
      enabled: asBoolean(input.enabled, existing?.enabled ?? true),
      includeUsage: true,
      isBuiltin: true,
      authRequired: true,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
  }

  if (kind === "openrouter") {
    throw new Error("فقط ارائه‌دهنده داخلی OpenRouter مجاز است.");
  }

  const name = cleanText(input.name, PROVIDER_LIMITS.name);
  if (!name) {
    throw new Error("نام ارائه‌دهنده الزامی است.");
  }

  return {
    id: input.id,
    name,
    kind: "openai-compatible",
    baseUrl: normalizeBaseUrl(input.baseUrl),
    enabled: asBoolean(input.enabled, true),
    includeUsage: asBoolean(input.includeUsage, true),
    isBuiltin: false,
    authRequired: asBoolean(input.authRequired, true),
    createdAt: existing?.createdAt ?? asFiniteNumber(input.createdAt, now),
    updatedAt: now,
  };
}

export function sanitizeModelConfig(
  value: unknown,
  options?: { existing?: ModelConfig | null; providerId?: string }
): ModelConfig {
  if (!value || typeof value !== "object") {
    throw new Error("پیکربندی مدل نامعتبر است.");
  }

  const input = value as Partial<ModelConfig>;
  const existing = options?.existing ?? null;
  const now = Date.now();

  if (!isModelRowId(input.id)) {
    throw new Error("شناسه مدل نامعتبر است.");
  }

  const providerId =
    (isId(input.providerId) ? input.providerId : null) ??
    options?.providerId ??
    existing?.providerId;
  if (!providerId) {
    throw new Error("شناسه ارائه‌دهنده مدل نامعتبر است.");
  }

  const modelId = cleanText(input.modelId, PROVIDER_LIMITS.modelId);
  if (!modelId || modelId.length > PROVIDER_LIMITS.modelId) {
    throw new Error("شناسه مدل API نامعتبر است.");
  }

  const name =
    cleanText(input.name, PROVIDER_LIMITS.modelName) ||
    modelId.split("/").at(-1) ||
    modelId;
  const fullName =
    cleanText(input.fullName, PROVIDER_LIMITS.modelName) || name;

  const source = (
    typeof input.source === "string" && MODEL_SOURCE_SET.has(input.source)
      ? input.source
      : existing?.source ?? "manual"
  ) as ModelSource;

  if (existing?.source === "builtin") {
    return {
      ...existing,
      name: cleanText(input.name, PROVIDER_LIMITS.modelName) || existing.name,
      fullName:
        cleanText(input.fullName, PROVIDER_LIMITS.modelName) ||
        existing.fullName,
      description:
        cleanText(input.description, PROVIDER_LIMITS.description) ||
        existing.description,
      contextLength: Math.max(
        0,
        asFiniteNumber(input.contextLength, existing.contextLength)
      ),
      maxOutput: Math.max(0, asFiniteNumber(input.maxOutput, existing.maxOutput)),
      inputPricePerM: Math.max(
        0,
        asFiniteNumber(input.inputPricePerM, existing.inputPricePerM)
      ),
      outputPricePerM: Math.max(
        0,
        asFiniteNumber(input.outputPricePerM, existing.outputPricePerM)
      ),
      supportsImages: asBoolean(input.supportsImages, existing.supportsImages),
      supportsTools: asBoolean(input.supportsTools, existing.supportsTools),
      supportsReasoningEffort: asBoolean(
        input.supportsReasoningEffort,
        existing.supportsReasoningEffort
      ),
      enabled: asBoolean(input.enabled, existing.enabled),
      isDefault: asBoolean(input.isDefault, existing.isDefault),
      updatedAt: now,
    };
  }

  return {
    id: input.id,
    providerId,
    modelId,
    name,
    fullName,
    description: cleanText(input.description, PROVIDER_LIMITS.description),
    contextLength: Math.max(0, asFiniteNumber(input.contextLength, 0)),
    maxOutput: Math.max(0, asFiniteNumber(input.maxOutput, 0)),
    inputPricePerM: Math.max(0, asFiniteNumber(input.inputPricePerM, 0)),
    outputPricePerM: Math.max(0, asFiniteNumber(input.outputPricePerM, 0)),
    supportsImages: asBoolean(input.supportsImages, false),
    supportsTools: asBoolean(input.supportsTools, true),
    supportsReasoningEffort: asBoolean(input.supportsReasoningEffort, false),
    enabled: asBoolean(input.enabled, true),
    isDefault: asBoolean(input.isDefault, false),
    source,
    createdAt: existing?.createdAt ?? asFiniteNumber(input.createdAt, now),
    updatedAt: now,
  };
}

export function isValidModelSlug(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.trim().length <= PROVIDER_LIMITS.modelId
  );
}
