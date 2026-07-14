import { safeStorage } from "electron";
import type {
  CredentialStatus,
  CredentialTestResult,
} from "@/lib/desktop-api";
import { AppDatabase } from "./storage/database";

const PROVIDER = "openrouter";

function cleanKey(value: unknown): string {
  if (typeof value !== "string") {
    throw new Error("کلید API باید متن باشد.");
  }
  const key = value.trim();
  if (key.length < 20 || key.length > 512) {
    throw new Error("کلید OpenRouter نامعتبر است.");
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

  getStatus(): CredentialStatus {
    const credential = this.database.getCredential(PROVIDER);
    return {
      configured: Boolean(credential),
      hint: credential?.hint ?? null,
      ...this.getEncryptionInfo(),
    };
  }

  setOpenRouterKey(value: unknown): CredentialStatus {
    const { secure } = this.getEncryptionInfo();
    if (!secure) {
      throw new Error(
        process.platform === "linux"
          ? "فضای امن ذخیره‌سازی در دسترس نیست. در لینوکس GNOME Keyring/libsecret یا KWallet را فعال کنید و برنامه را دوباره اجرا کنید."
          : "فضای امن ذخیره‌سازی سیستم‌عامل در دسترس نیست."
      );
    }

    const key = cleanKey(value);
    const encryptedKey = safeStorage.encryptString(key);
    this.database.setCredential(
      PROVIDER,
      encryptedKey,
      `••••${key.slice(-4)}`
    );
    return this.getStatus();
  }

  clearOpenRouterKey(): CredentialStatus {
    this.database.clearCredential(PROVIDER);
    return this.getStatus();
  }

  getOpenRouterKey(): string | null {
    const credential = this.database.getCredential(PROVIDER);
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

  async testOpenRouterKey(value?: unknown): Promise<CredentialTestResult> {
    const key =
      typeof value === "string" && value.trim()
        ? cleanKey(value)
        : this.getOpenRouterKey();
    if (!key) {
      return { ok: false, message: "کلید OpenRouter تنظیم نشده است." };
    }

    try {
      const response = await fetch("https://openrouter.ai/api/v1/auth/key", {
        headers: { Authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(15_000),
      });
      if (response.ok) {
        return { ok: true, message: "اتصال به OpenRouter با موفقیت برقرار شد." };
      }
      if (response.status === 401 || response.status === 403) {
        return { ok: false, message: "OpenRouter این کلید API را رد کرد." };
      }
      return {
        ok: false,
        message: `OpenRouter پاسخ HTTP ${response.status} داد.`,
      };
    } catch {
      return {
        ok: false,
        message: "اتصال به OpenRouter برقرار نشد. اتصال اینترنت خود را بررسی کنید.",
      };
    }
  }
}
