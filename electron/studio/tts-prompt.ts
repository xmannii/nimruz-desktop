/**
 * Gemini TTS speaks whatever text it receives, so a tone simply prefixed to
 * the script ("warm and calm: …") gets read aloud. Google's prompting guide
 * avoids that with an explicit synthesis preamble, a direction-only note,
 * and the exact `#### TRANSCRIPT` header before the words to speak.
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
