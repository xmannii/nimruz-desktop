export const DEFAULT_CORRECTION_PROMPT =
  "خطاهای تشخیص گفتار را اصلاح کن، نشانه‌گذاری و فاصله‌گذاری فارسی را بهبود بده و لحن و معنای گوینده را تغییر نده.";

export const MAX_CORRECTION_TEXT_CHARS = 60_000;
export const MAX_CORRECTION_PROMPT_CHARS = 2_000;
export const CORRECTION_CHUNK_CHARS = 24_000;

export type SpeechCorrectionRequest = {
  text: string;
  prompt?: string;
  providerId?: string;
  model?: string;
};

export type SpeechCorrectionResponse = {
  correctedText?: string;
  error?: string;
};

export function splitTextForCorrection(
  text: string,
  maxChars = CORRECTION_CHUNK_CHARS
) {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (trimmed.length <= maxChars) return [trimmed];

  const chunks: string[] = [];
  let remaining = trimmed;
  while (remaining.length > maxChars) {
    const candidate = remaining.slice(0, maxChars);
    const paragraphBreak = candidate.lastIndexOf("\n\n");
    const sentenceBreak = Math.max(
      candidate.lastIndexOf(". "),
      candidate.lastIndexOf("؟ "),
      candidate.lastIndexOf("! "),
      candidate.lastIndexOf("؛ ")
    );
    const cut = Math.max(paragraphBreak, sentenceBreak);
    const safeCut = cut >= Math.floor(maxChars * 0.6) ? cut + 1 : maxChars;
    chunks.push(remaining.slice(0, safeCut).trim());
    remaining = remaining.slice(safeCut).trim();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

export function cleanCorrectedTranscript(text: string) {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:text|markdown)?\s*\n([\s\S]*?)\n```$/i);
  return (fenced?.[1] ?? trimmed).trim();
}
