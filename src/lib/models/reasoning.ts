export const REASONING_EFFORT_LEVELS = [
  "none",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
] as const;

export type ReasoningEffort = (typeof REASONING_EFFORT_LEVELS)[number];

export const DEFAULT_REASONING_EFFORT: ReasoningEffort = "medium";

const REASONING_EFFORT_LABELS: Record<ReasoningEffort, string> = {
  none: "خاموش",
  minimal: "خیلی کم",
  low: "کم",
  medium: "متوسط",
  high: "زیاد",
  xhigh: "حداکثر",
};

const REASONING_EFFORT_DESCRIPTIONS: Record<ReasoningEffort, string> = {
  none: "بدون فکر کردن؛ سریع‌ترین پاسخ",
  minimal: "کمترین میزان فکر کردن",
  low: "فکر کردن سریع و مختصر",
  medium: "تعادل بین سرعت و دقت",
  high: "فکر کردن دقیق و کامل‌تر",
  xhigh: "بیشترین دقت؛ کندتر و پرهزینه‌تر",
};

export function getReasoningEffortLabel(effort: ReasoningEffort): string {
  return REASONING_EFFORT_LABELS[effort];
}

export function getReasoningEffortDescription(effort: ReasoningEffort): string {
  return REASONING_EFFORT_DESCRIPTIONS[effort];
}

export function getReasoningEffortIndex(effort: ReasoningEffort): number {
  return REASONING_EFFORT_LEVELS.indexOf(effort);
}

export function getReasoningEffortFromIndex(index: number): ReasoningEffort {
  const clamped = Math.max(0, Math.min(index, REASONING_EFFORT_LEVELS.length - 1));
  return REASONING_EFFORT_LEVELS[clamped];
}

export function isReasoningEffort(value: unknown): value is ReasoningEffort {
  return (
    typeof value === "string" &&
    REASONING_EFFORT_LEVELS.includes(value as ReasoningEffort)
  );
}
