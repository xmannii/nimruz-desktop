import { safeStorage } from "electron";
import type {
  CredentialStatus,
  CredentialTestResult,
} from "@/lib/desktop-api";
import {
  OPENROUTER_BASE_URL,
  OPENROUTER_PROVIDER_ID,
  type DiscoveredModel,
  type ModelDiscoveryResult,
  type ProviderConfig,
} from "@/lib/models/catalog";
import {
  extractModelId,
  extractModelListItems,
  isChatCompletionDiscoverableModel,
} from "@/lib/models/discover-filter";
import { normalizeBaseUrl } from "@/lib/models/sanitize";
import { AppDatabase } from "./storage/database";

function cleanKey(value: unknown, required = true): string | null {
  if (typeof value !== "string" || !value.trim()) {
    if (required) throw new Error("کلید API باید متن باشد.");
    return null;
  }
  const key = value.trim();
  if (key.length < 8 || key.length > 512) {
    throw new Error("کلید API نامعتبر است.");
  }
  return key;
}

export class CredentialService {
  constructor(private readonly database: AppDatabase) {}

  private getEncryptionInfo() {
    const encryptionAvailable = safeStorage.isEncryptionAvailable();
    const backend =
      process.platform === "linux"
        ? safeStorage.getSelectedStorageBackend()
        : process.platform === "darwin"
          ? "keychain"
          : "dpapi";
    const secure = encryptionAvailable && backend !== "basic_text";
    return { encryptionAvailable, backend, secure };
  }

  getStatus(providerId = OPENROUTER_PROVIDER_ID): CredentialStatus {
    const credential = this.database.getCredential(providerId);
    return {
      configured: Boolean(credential),
      hint: credential?.hint ?? null,
      ...this.getEncryptionInfo(),
    };
  }

  setKey(providerId: string, value: unknown): CredentialStatus {
    if (!/^[\w-]{1,128}$/.test(providerId)) {
      throw new Error("شناسه ارائه‌دهنده نامعتبر است.");
    }

    const { secure } = this.getEncryptionInfo();
    if (!secure) {
      throw new Error(
        process.platform === "linux"
          ? "فضای امن ذخیره‌سازی در دسترس نیست. در لینوکس GNOME Keyring/libsecret یا KWallet را فعال کنید و برنامه را دوباره اجرا کنید."
          : "فضای امن ذخیره‌سازی سیستم‌عامل در دسترس نیست."
      );
    }

    const key = cleanKey(value, true);
    if (!key) throw new Error("کلید API باید متن باشد.");

    const encryptedKey = safeStorage.encryptString(key);
    this.database.setCredential(
      providerId,
      encryptedKey,
      `••••${key.slice(-4)}`
    );
    return this.getStatus(providerId);
  }

  clearKey(providerId: string): CredentialStatus {
    this.database.clearCredential(providerId);
    return this.getStatus(providerId);
  }

  getKey(providerId: string): string | null {
    const credential = this.database.getCredential(providerId);
    if (!credential) return null;
    const { secure } = this.getEncryptionInfo();
    if (!secure) return null;

    try {
      return safeStorage.decryptString(credential.encryptedKey);
    } catch {
      throw new Error(
        "کلید ذخیره‌شده دیگر قابل رمزگشایی نیست. آن را حذف کنید و کلید جدیدی وارد کنید."
      );
    }
  }

  /** @deprecated Prefer setKey(OPENROUTER_PROVIDER_ID, key) */
  setOpenRouterKey(value: unknown): CredentialStatus {
    return this.setKey(OPENROUTER_PROVIDER_ID, value);
  }

  /** @deprecated Prefer clearKey(OPENROUTER_PROVIDER_ID) */
  clearOpenRouterKey(): CredentialStatus {
    return this.clearKey(OPENROUTER_PROVIDER_ID);
  }

  /** @deprecated Prefer getKey(OPENROUTER_PROVIDER_ID) */
  getOpenRouterKey(): string | null {
    return this.getKey(OPENROUTER_PROVIDER_ID);
  }

  /** @deprecated Prefer testProvider */
  async testOpenRouterKey(value?: unknown): Promise<CredentialTestResult> {
    return this.testProvider({
      providerId: OPENROUTER_PROVIDER_ID,
      apiKey: typeof value === "string" ? value : undefined,
    });
  }

  async testProvider(options: {
    providerId?: string;
    baseUrl?: string;
    apiKey?: string;
  }): Promise<CredentialTestResult> {
    const providerId = options.providerId ?? OPENROUTER_PROVIDER_ID;
    const provider = this.database.getProvider(providerId);
    const baseUrl = options.baseUrl
      ? normalizeBaseUrl(options.baseUrl)
      : provider?.baseUrl ?? OPENROUTER_BASE_URL;

    const key =
      typeof options.apiKey === "string" && options.apiKey.trim()
        ? cleanKey(options.apiKey, true)
        : this.getKey(providerId);

    if (!key) {
      if (provider && !provider.authRequired) {
        // keyless local providers
      } else if (!provider && providerId === OPENROUTER_PROVIDER_ID) {
        return { ok: false, message: "کلید OpenRouter تنظیم نشده است." };
      } else if (provider?.authRequired !== false) {
        return { ok: false, message: "کلید API تنظیم نشده است." };
      }
    }

    try {
      if (providerId === OPENROUTER_PROVIDER_ID || provider?.kind === "openrouter") {
        if (!key) {
          return { ok: false, message: "کلید OpenRouter تنظیم نشده است." };
        }
        const response = await fetch(`${OPENROUTER_BASE_URL}/auth/key`, {
          headers: { Authorization: `Bearer ${key}` },
          signal: AbortSignal.timeout(15_000),
        });
        if (response.ok) {
          return {
            ok: true,
            message: "اتصال به OpenRouter با موفقیت برقرار شد.",
          };
        }
        if (response.status === 401 || response.status === 403) {
          return { ok: false, message: "OpenRouter این کلید API را رد کرد." };
        }
        return {
          ok: false,
          message: `OpenRouter پاسخ HTTP ${response.status} داد.`,
        };
      }

      const headers: Record<string, string> = {};
      if (key) headers.Authorization = `Bearer ${key}`;

      const response = await fetch(`${baseUrl.replace(/\/$/, "")}/models`, {
        headers,
        signal: AbortSignal.timeout(15_000),
      });

      if (response.ok) {
        return {
          ok: true,
          message: "اتصال به ارائه‌دهنده با موفقیت برقرار شد.",
        };
      }
      if (response.status === 401 || response.status === 403) {
        return { ok: false, message: "ارائه‌دهنده این کلید API را رد کرد." };
      }
      return {
        ok: false,
        message: `ارائه‌دهنده پاسخ HTTP ${response.status} داد.`,
      };
    } catch {
      return {
        ok: false,
        message:
          "اتصال برقرار نشد. آدرس پایه، کلید و دسترسی شبکه را بررسی کنید.",
      };
    }
  }

  async discoverModels(options: {
    providerId: string;
    baseUrl?: string;
    apiKey?: string;
  }): Promise<ModelDiscoveryResult> {
    const provider = this.database.getProvider(options.providerId);
    if (!provider) {
      return {
        ok: false,
        message: "ارائه‌دهنده یافت نشد.",
        models: [],
        added: 0,
        updated: 0,
      };
    }

    const baseUrl = options.baseUrl
      ? normalizeBaseUrl(options.baseUrl)
      : provider.baseUrl;
    const key =
      typeof options.apiKey === "string" && options.apiKey.trim()
        ? cleanKey(options.apiKey, true)
        : this.getKey(options.providerId);

    try {
      const headers: Record<string, string> = {};
      if (key) headers.Authorization = `Bearer ${key}`;

      const response = await fetch(`${baseUrl.replace(/\/$/, "")}/models`, {
        headers,
        signal: AbortSignal.timeout(20_000),
      });

      if (!response.ok) {
        return {
          ok: false,
          message: `دریافت فهرست مدل‌ها ناموفق بود (HTTP ${response.status}).`,
          models: [],
          added: 0,
          updated: 0,
        };
      }

      const payload = await response.json();
      const discovered: DiscoveredModel[] = [];
      const seen = new Set<string>();
      let skipped = 0;

      for (const item of extractModelListItems(payload)) {
        const modelId = extractModelId(item);
        if (!modelId || seen.has(modelId)) continue;
        if (!isChatCompletionDiscoverableModel(item, modelId)) {
          skipped += 1;
          continue;
        }
        seen.add(modelId);
        discovered.push({
          modelId,
          name:
            typeof item.name === "string" && item.name.trim()
              ? item.name.trim().slice(0, 120)
              : undefined,
        });
      }

      const skippedNote =
        skipped > 0
          ? ` (${skipped.toLocaleString("fa-IR")} مدل غیرگفتگو نادیده گرفته شد)`
          : "";

      return {
        ok: true,
        message: `${discovered.length.toLocaleString("fa-IR")} مدل گفتگو پیدا شد${skippedNote}.`,
        models: discovered,
        added: 0,
        updated: 0,
      };
    } catch {
      return {
        ok: false,
        message: "دریافت فهرست مدل‌ها ممکن نشد.",
        models: [],
        added: 0,
        updated: 0,
      };
    }
  }

  resolveProviderAuth(provider: ProviderConfig): {
    apiKey: string | null;
    ok: boolean;
    message?: string;
  } {
    const apiKey = this.getKey(provider.id);
    if (provider.authRequired && !apiKey) {
      return {
        apiKey: null,
        ok: false,
        message:
          provider.kind === "openrouter"
            ? "کلید OpenRouter تنظیم نشده است. آن را در تنظیمات وارد کنید."
            : `کلید API برای «${provider.name}» تنظیم نشده است.`,
      };
    }
    return { apiKey, ok: true };
  }
}
