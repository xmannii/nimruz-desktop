/** Gemini audio transcription over the REST API (inline or Files API). */

type FetchLike = typeof fetch;
type Auth = { apiKey: string; baseUrl: string };

/** Requests stay under Gemini's ~20MB inline limit; larger audio is uploaded. */
export const GEMINI_INLINE_AUDIO_BYTES = 14 * 1024 * 1024;

export const TRANSCRIPTION_PROMPT = [
  "Transcribe this audio verbatim in the language it is spoken in (usually Persian).",
  "Use natural punctuation and correct Persian spacing, including half-spaces (نیم‌فاصله).",
  "Start a new paragraph when the speaker or topic changes.",
  "Do not translate, summarise, add timestamps, or add any commentary. Output only the transcript.",
].join("\n");

export class GeminiAudioError extends Error {
  constructor(message: string, readonly statusCode?: number) {
    super(message);
  }
}

async function failure(response: Response) {
  const body = await response.text().catch(() => "");
  let message = body.slice(0, 300) || response.statusText;
  try {
    const parsed = JSON.parse(body) as { error?: { message?: string } };
    if (parsed.error?.message) message = parsed.error.message;
  } catch {
    // Keep the raw body.
  }
  return new GeminiAudioError(message, response.status);
}

function uploadBase(baseUrl: string) {
  // https://…/v1beta → https://…/upload/v1beta
  const url = new URL(baseUrl);
  return `${url.origin}/upload${url.pathname.replace(/\/+$/, "")}`;
}

/** Uploads audio with the resumable Files API and waits until it is usable. */
export async function uploadGeminiFile(
  fetchImpl: FetchLike,
  auth: Auth,
  data: Buffer,
  mimeType: string,
  displayName: string,
  signal: AbortSignal
): Promise<{ name: string; uri: string }> {
  const start = await fetchImpl(`${uploadBase(auth.baseUrl)}/files`, {
    method: "POST",
    signal,
    headers: {
      "x-goog-api-key": auth.apiKey,
      "X-Goog-Upload-Protocol": "resumable",
      "X-Goog-Upload-Command": "start",
      "X-Goog-Upload-Header-Content-Length": String(data.byteLength),
      "X-Goog-Upload-Header-Content-Type": mimeType,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ file: { display_name: displayName.slice(0, 100) } }),
  });
  if (!start.ok) throw await failure(start);
  const uploadUrl = start.headers.get("x-goog-upload-url");
  if (!uploadUrl || new URL(uploadUrl).origin !== new URL(auth.baseUrl).origin) {
    throw new GeminiAudioError("آدرس بارگذاری Google نامعتبر است.");
  }

  const finish = await fetchImpl(uploadUrl, {
    method: "POST",
    signal,
    headers: {
      "Content-Length": String(data.byteLength),
      "X-Goog-Upload-Offset": "0",
      "X-Goog-Upload-Command": "upload, finalize",
    },
    body: new Uint8Array(data),
  });
  if (!finish.ok) throw await failure(finish);
  const uploaded = (await finish.json()) as { file?: { name?: string; uri?: string; state?: string } };
  let file = uploaded.file;
  if (!file?.name || !file.uri || !/^files\/[\w-]+$/.test(file.name)) {
    throw new GeminiAudioError("پاسخ نامعتبر از Google دریافت شد.");
  }

  for (let attempt = 0; file.state === "PROCESSING" && attempt < 60; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 1_000));
    signal.throwIfAborted();
    const poll: Response = await fetchImpl(`${auth.baseUrl}/${file.name}`, {
      headers: { "x-goog-api-key": auth.apiKey },
      signal,
    });
    if (!poll.ok) throw await failure(poll);
    file = { ...file, ...((await poll.json()) as typeof file) };
  }
  if (file.state === "FAILED") throw new GeminiAudioError("Google نتوانست فایل صوتی را پردازش کند.");
  return { name: file.name!, uri: file.uri! };
}

export async function deleteGeminiFile(fetchImpl: FetchLike, auth: Auth, name: string) {
  await fetchImpl(`${auth.baseUrl}/${name}`, {
    method: "DELETE",
    headers: { "x-goog-api-key": auth.apiKey },
  }).catch(() => undefined);
}

/** Asks a Gemini model for the transcript of inline or uploaded audio. */
export async function transcribeWithGemini(
  fetchImpl: FetchLike,
  auth: Auth,
  input: {
    modelId: string;
    mimeType: string;
    audio: { inline: Buffer } | { fileUri: string };
    instructions?: string;
  },
  signal: AbortSignal
): Promise<string> {
  const prompt = input.instructions
    ? `${TRANSCRIPTION_PROMPT}\n\nContext from the user (names, terms, spelling): ${input.instructions}`
    : TRANSCRIPTION_PROMPT;
  const audioPart =
    "inline" in input.audio
      ? { inline_data: { mime_type: input.mimeType, data: input.audio.inline.toString("base64") } }
      : { file_data: { mime_type: input.mimeType, file_uri: input.audio.fileUri } };
  const response = await fetchImpl(
    `${auth.baseUrl}/models/${encodeURIComponent(input.modelId)}:generateContent`,
    {
      method: "POST",
      signal,
      headers: { "x-goog-api-key": auth.apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }, audioPart] }],
        generationConfig: { temperature: 0 },
      }),
    }
  );
  if (!response.ok) throw await failure(response);
  const payload = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> }; finishReason?: string }>;
    promptFeedback?: { blockReason?: string };
  };
  if (payload.promptFeedback?.blockReason) {
    throw new GeminiAudioError("Google این فایل را به دلیل سیاست محتوا پردازش نکرد.");
  }
  const text = (payload.candidates?.[0]?.content?.parts ?? [])
    .map((part) => part.text ?? "")
    .join("")
    .trim();
  if (!text) throw new GeminiAudioError("گفتار قابل‌تشخیصی در این فایل شنیده نشد.");
  return text;
}
