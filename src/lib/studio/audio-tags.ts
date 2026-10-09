/** ElevenLabs v3/v4 audio tags such as [whispers] or [short pause]. */
export const AUDIO_TAG_PATTERN = /\[([^\]\n]{1,40})\]/g;

export type AudioTagTone = "emotion" | "delivery" | "sound" | "pause";

const TAGS: Record<string, { label: string; tone: AudioTagTone }> = {
  // Emotions
  excited: { label: "هیجان‌زده", tone: "emotion" },
  happy: { label: "شاد", tone: "emotion" },
  cheerfully: { label: "شادمانه", tone: "emotion" },
  sad: { label: "غمگین", tone: "emotion" },
  angry: { label: "عصبانی", tone: "emotion" },
  nervous: { label: "مضطرب", tone: "emotion" },
  curious: { label: "کنجکاو", tone: "emotion" },
  thoughtful: { label: "متفکر", tone: "emotion" },
  sarcastic: { label: "کنایه‌آمیز", tone: "emotion" },
  surprised: { label: "متعجب", tone: "emotion" },
  amazed: { label: "شگفت‌زده", tone: "emotion" },
  impressed: { label: "تحت تأثیر", tone: "emotion" },
  frustrated: { label: "کلافه", tone: "emotion" },
  annoyed: { label: "دلخور", tone: "emotion" },
  tired: { label: "خسته", tone: "emotion" },
  hesitant: { label: "مردد", tone: "emotion" },
  confident: { label: "مطمئن", tone: "emotion" },
  mischievously: { label: "شیطنت‌آمیز", tone: "emotion" },
  serious: { label: "جدی", tone: "emotion" },
  // Delivery
  whispers: { label: "نجوا", tone: "delivery" },
  whispering: { label: "نجوا", tone: "delivery" },
  softly: { label: "آهسته", tone: "delivery" },
  calm: { label: "آرام", tone: "delivery" },
  calmly: { label: "آرام", tone: "delivery" },
  warmly: { label: "گرم", tone: "delivery" },
  shouts: { label: "فریاد", tone: "delivery" },
  shouting: { label: "فریاد", tone: "delivery" },
  sings: { label: "آواز", tone: "delivery" },
  slowly: { label: "آهسته و شمرده", tone: "delivery" },
  quickly: { label: "تند", tone: "delivery" },
  // Non-verbal sounds
  laughs: { label: "خنده", tone: "sound" },
  laughing: { label: "خندان", tone: "sound" },
  "laughs harder": { label: "خنده بلند", tone: "sound" },
  "starts laughing": { label: "شروع خنده", tone: "sound" },
  chuckles: { label: "خنده ریز", tone: "sound" },
  giggles: { label: "ریزخند", tone: "sound" },
  sighs: { label: "آه", tone: "sound" },
  exhales: { label: "بازدم", tone: "sound" },
  gasps: { label: "نفس‌بریده", tone: "sound" },
  crying: { label: "گریه", tone: "sound" },
  sniffs: { label: "فین", tone: "sound" },
  "clears throat": { label: "صاف کردن گلو", tone: "sound" },
  // Timing
  pause: { label: "مکث", tone: "pause" },
  "short pause": { label: "مکث کوتاه", tone: "pause" },
  "long pause": { label: "مکث طولانی", tone: "pause" },
};

export function translateAudioTag(raw: string): { label: string; tone: AudioTagTone } {
  const key = raw.trim().toLowerCase();
  return TAGS[key] ?? { label: raw.trim(), tone: key.includes("pause") ? "pause" : "delivery" };
}

export type AudioTagSegment =
  | { type: "text"; value: string }
  | { type: "tag"; raw: string; label: string; tone: AudioTagTone };

/** Splits a script into plain text and audio-tag segments, in order. */
export function splitAudioTags(text: string): AudioTagSegment[] {
  const segments: AudioTagSegment[] = [];
  let last = 0;
  for (const match of text.matchAll(AUDIO_TAG_PATTERN)) {
    const index = match.index ?? 0;
    if (index > last) segments.push({ type: "text", value: text.slice(last, index) });
    segments.push({ type: "tag", raw: match[0], ...translateAudioTag(match[1]) });
    last = index + match[0].length;
  }
  if (last < text.length) segments.push({ type: "text", value: text.slice(last) });
  return segments;
}

const RTL_CHAR = /[֐-ࣿיִ-﷿ﹰ-﻿]/;
const LTR_CHAR = /[A-Za-zÀ-ɏ]/;

/**
 * Direction from the first strong letter, ignoring audio tags so a Persian
 * script that starts with "[excited]" still reads right-to-left.
 */
export function textDirection(text: string): "rtl" | "ltr" {
  const spoken = text.replace(AUDIO_TAG_PATTERN, " ");
  for (const char of spoken) {
    if (RTL_CHAR.test(char)) return "rtl";
    if (LTR_CHAR.test(char)) return "ltr";
  }
  return "rtl";
}
