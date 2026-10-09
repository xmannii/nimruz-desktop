import type { ProviderModelRef } from "@/lib/models/catalog";
import type { StudioEnhanceRequest } from "./types";

let sessionTokenPromise: Promise<string> | undefined;

function getSessionToken() {
  sessionTokenPromise ??= window.desktop.auth.getSessionToken();
  return sessionTokenPromise;
}

/** Rewrites a rough (often Persian) idea into a detailed English prompt. */
export async function requestPromptEnhancement(options: {
  kind: StudioEnhanceRequest["kind"];
  prompt: string;
  model: ProviderModelRef;
  signal?: AbortSignal;
}) {
  const body: StudioEnhanceRequest = {
    kind: options.kind,
    prompt: options.prompt,
    providerId: options.model.providerId,
    model: options.model.modelId,
  };
  const response = await fetch("/api/studio/enhance", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${await getSessionToken()}`,
    },
    body: JSON.stringify(body),
    signal: options.signal,
  });
  const payload = (await response.json().catch(() => null)) as
    | { prompt?: string; error?: string }
    | null;
  if (!response.ok || typeof payload?.prompt !== "string") {
    throw new Error(payload?.error ?? "بهبود متن ناموفق بود.");
  }
  return payload.prompt;
}
