/**
 * How delivery direction (tone, pace, emotion) reaches Gemini TTS without
 * being spoken:
 * - Gemini 3.8+ treats `text` strictly as a verbatim transcript, so the
 *   direction must go in the part's `speech_metadata.style` field.
 * - Older preview models have no such field; Google's guidance for them is a
 *   synthesis preamble, direction-only notes, and the `#### TRANSCRIPT` header.
 * OpenRouter's `instructions` field already maps to `speech_metadata.style`.
 */
export function buildGeminiTtsPrompt(text: string, direction: string | undefined) {
  const notes = direction?.trim();
  if (!notes) return text;
  return [
    "Synthesize speech for the performance described below.",
    "The performance notes are direction only. Do NOT speak them. Speak ONLY the lines under #### TRANSCRIPT, exactly as written, in their original language.",
    "",
    "### PERFORMANCE",
    notes,
    "",
    "#### TRANSCRIPT",
    text,
  ].join("\n");
}

/** Gemini TTS models, whether called directly or through OpenRouter. */
export function isGeminiTtsModel(modelId: string) {
  return /(^|\/)gemini-[\w.-]*tts/.test(modelId);
}

/** Gemini 3.8 and later read `text` verbatim and take `speech_metadata.style`. */
export function supportsSpeechMetadataStyle(modelId: string) {
  const match = /gemini-(\d+)(?:\.(\d+))?/.exec(modelId);
  if (!match) return false;
  const major = Number(match[1]);
  const minor = Number(match[2] ?? 0);
  return major > 3 || (major === 3 && minor >= 8);
}

/** Request body for Gemini TTS `generateContent` with direction kept separate. */
export function buildGeminiTtsRequest(input: {
  modelId: string;
  text: string;
  voice?: string;
  style?: string;
}) {
  const style = input.style?.trim();
  const metadata = supportsSpeechMetadataStyle(input.modelId);
  const part = metadata
    ? { text: input.text, ...(style ? { speech_metadata: { style } } : {}) }
    : { text: buildGeminiTtsPrompt(input.text, style) };
  return {
    contents: [{ role: "user", parts: [part] }],
    generationConfig: {
      responseModalities: ["AUDIO"],
      ...(input.voice
        ? {
            speechConfig: {
              voiceConfig: metadata
                ? { voice: input.voice }
                : { prebuiltVoiceConfig: { voiceName: input.voice } },
            },
          }
        : {}),
    },
  };
}

/** Wraps raw 16-bit mono PCM (Gemini's `audio/L16`) in a WAV header. */
export function pcmToWav(pcm: Buffer, sampleRate: number) {
  const header = Buffer.alloc(44);
  const byteRate = sampleRate * 2;
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.byteLength, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(2, 32); // block align
  header.writeUInt16LE(16, 34); // bits per sample
  header.write("data", 36);
  header.writeUInt32LE(pcm.byteLength, 40);
  return Buffer.concat([header, pcm]);
}

/** Turns Gemini's inline audio into a playable file. */
export function geminiAudioToFile(data: Buffer, mimeType: string) {
  if (/^audio\/(wav|x-wav|mpeg|mp3|ogg)/.test(mimeType)) {
    return { data, mimeType: mimeType.split(";")[0] };
  }
  const rate = Number(/rate=(\d+)/.exec(mimeType)?.[1] ?? 24_000);
  return { data: pcmToWav(data, Number.isFinite(rate) && rate > 0 ? rate : 24_000), mimeType: "audio/wav" };
}
