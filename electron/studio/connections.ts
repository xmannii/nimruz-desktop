import {
  STUDIO_CREDENTIAL_IDS,
  type StudioConnectionId,
  type StudioConnections,
  type StudioConnectionStatus,
} from "@/lib/studio/types";
import type { ProviderConfig } from "@/lib/models/catalog";
import type { ProviderAuth } from "./service";

export const GOOGLE_AI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";

type CredentialReader = {
  getKey: (id: string) => string | null;
  getStatus: (id: string) => { configured: boolean; hint: string | null };
};

function isGeminiApiProvider(provider: ProviderConfig) {
  try {
    return (
      provider.enabled &&
      new URL(provider.baseUrl).hostname === "generativelanguage.googleapis.com"
    );
  } catch {
    return false;
  }
}

/**
 * Resolves Studio connections. A key entered in Studio wins; otherwise a
 * Gemini API provider already configured for chat is reused, so people who
 * set up Gemini once do not have to paste the key again.
 */
export function createStudioConnections(options: {
  credentials: CredentialReader;
  listProviders: () => ProviderConfig[];
}) {
  const { credentials, listProviders } = options;

  function chatGoogleProvider() {
    return listProviders().find(
      (provider) => isGeminiApiProvider(provider) && credentials.getStatus(provider.id).configured
    );
  }

  function getGoogleAuth(): ProviderAuth | null {
    const studioKey = credentials.getKey(STUDIO_CREDENTIAL_IDS.google);
    if (studioKey) return { apiKey: studioKey, baseUrl: GOOGLE_AI_BASE_URL };
    const provider = chatGoogleProvider();
    const apiKey = provider ? credentials.getKey(provider.id) : null;
    return provider && apiKey
      ? { apiKey, baseUrl: provider.baseUrl.replace(/\/+$/, "") }
      : null;
  }

  function status(id: StudioConnectionId): StudioConnectionStatus {
    const own = credentials.getStatus(STUDIO_CREDENTIAL_IDS[id]);
    if (own.configured) return { configured: true, hint: own.hint, source: "studio" };
    if (id === "google") {
      const provider = chatGoogleProvider();
      if (provider) {
        return {
          configured: true,
          hint: credentials.getStatus(provider.id).hint,
          source: "provider",
        };
      }
    }
    return { configured: false, hint: null, source: null };
  }

  return {
    getGoogleAuth,
    getElevenLabsKey: () => credentials.getKey(STUDIO_CREDENTIAL_IDS.elevenlabs),
    getStatus: (): StudioConnections => ({
      google: status("google"),
      elevenlabs: status("elevenlabs"),
    }),
  };
}
