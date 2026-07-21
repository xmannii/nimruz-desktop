import {
  cleanCorrectedTranscript,
  splitTextForCorrection,
  type SpeechCorrectionResponse,
} from "@/lib/speech/correction";
import type { ProviderModelRef } from "@/lib/models/catalog";

let sessionTokenPromise: Promise<string> | undefined;

function getSessionToken() {
  sessionTokenPromise ??= window.desktop.auth.getSessionToken();
  return sessionTokenPromise;
}

async function correctChunk(options: {
  text: string;
  prompt: string;
  model: ProviderModelRef;
  signal?: AbortSignal;
}) {
  const response = await fetch("/api/speech/correct", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${await getSessionToken()}`,
    },
    body: JSON.stringify({
      text: options.text,
      prompt: options.prompt,
      providerId: options.model.providerId,
      model: options.model.modelId,
    }),
    signal: options.signal,
  });
  const payload = (await response.json().catch(() => null)) as
    | SpeechCorrectionResponse
    | null;
  if (!response.ok || typeof payload?.correctedText !== "string") {
    throw new Error(payload?.error ?? "اصلاح متن با هوش مصنوعی ناموفق بود.");
  }
  return cleanCorrectedTranscript(payload.correctedText);
}

export async function requestTranscriptCorrection(options: {
  text: string;
  prompt: string;
  model: ProviderModelRef;
  signal?: AbortSignal;
}) {
  const chunks = splitTextForCorrection(options.text);
  const corrected: string[] = [];
  for (const chunk of chunks) {
    corrected.push(await correctChunk({ ...options, text: chunk }));
  }
  return corrected.join("\n\n");
}
