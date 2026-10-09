import {
  STUDIO_KINDS,
  STUDIO_MEDIA_SCHEME,
  type StudioItem,
  type StudioKind,
} from "./types";

export const STUDIO_TABS = ["image", "video", "speech", "transcribe"] as const;
export type StudioTab = (typeof STUDIO_TABS)[number];

export const STUDIO_TAB_LABELS: Record<StudioTab, string> = {
  image: "تصویر",
  video: "ویدیو",
  speech: "صدا",
  transcribe: "رونویسی",
};

export const STUDIO_KIND_LABELS: Record<StudioKind, string> = {
  image: "تصویر",
  video: "ویدیو",
  speech: "صدا",
  transcript: "رونویسی",
};

export function isStudioTab(value: unknown): value is StudioTab {
  return (
    typeof value === "string" && (STUDIO_TABS as readonly string[]).includes(value)
  );
}

export function isStudioKind(value: unknown): value is StudioKind {
  return (
    typeof value === "string" && (STUDIO_KINDS as readonly string[]).includes(value)
  );
}

export function studioTabKind(tab: StudioTab): StudioKind {
  return tab === "transcribe" ? "transcript" : tab;
}

export function studioKindTab(kind: StudioKind): StudioTab {
  return kind === "transcript" ? "transcribe" : kind;
}

/** Cache-busting media URL served by the main process protocol handler. */
export function studioMediaUrl(item: Pick<StudioItem, "id" | "updatedAt">) {
  return `${STUDIO_MEDIA_SCHEME}://item/${encodeURIComponent(item.id)}?v=${item.updatedAt}`;
}

export function isStudioItemBusy(item: Pick<StudioItem, "status">) {
  return item.status === "pending" || item.status === "running";
}

/** "16:9" → 16/9, used for gallery placeholders before media loads. */
export function parseAspectRatio(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const match = /^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/.exec(value.trim());
  if (!match) return null;
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (!(width > 0) || !(height > 0)) return null;
  return width / height;
}

export function formatStudioCost(cost: number | null | undefined) {
  if (cost === null || cost === undefined || !Number.isFinite(cost)) return null;
  if (cost === 0) return "رایگان";
  if (cost < 0.01) return `$${cost.toFixed(4)}`;
  return `$${cost.toFixed(2)}`;
}

export function formatStudioDuration(seconds: number | null | undefined) {
  if (!seconds || !Number.isFinite(seconds) || seconds <= 0) return null;
  const total = Math.round(seconds);
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return `${minutes.toLocaleString("fa-IR")}:${rest
    .toLocaleString("fa-IR", { minimumIntegerDigits: 2 })}`;
}

/** Strips the vendor prefix and dated suffixes from a model display name. */
export function shortModelName(name: string) {
  const withoutVendor = name.includes(": ") ? name.split(": ").slice(1).join(": ") : name;
  return withoutVendor.trim() || name;
}

export function modelVendor(modelId: string) {
  return modelId.split("/")[0] ?? modelId;
}

export function studioItemTitle(prompt: string, fallback: string) {
  const firstLine = prompt.replace(/\s+/g, " ").trim();
  if (!firstLine) return fallback;
  return firstLine.length > 80 ? `${firstLine.slice(0, 79)}…` : firstLine;
}

export function mediaExtension(mimeType: string | null | undefined) {
  switch (mimeType) {
    case "image/png":
      return "png";
    case "image/jpeg":
      return "jpg";
    case "image/webp":
      return "webp";
    case "image/gif":
      return "gif";
    case "video/mp4":
      return "mp4";
    case "video/webm":
      return "webm";
    case "audio/mpeg":
      return "mp3";
    case "audio/wav":
    case "audio/x-wav":
      return "wav";
    case "audio/webm":
      return "webm";
    case "audio/ogg":
      return "ogg";
    case "audio/mp4":
    case "audio/x-m4a":
      return "m4a";
    case "audio/flac":
      return "flac";
    case "audio/aac":
      return "aac";
    default:
      return "bin";
  }
}

/** "همین حالا", "۵ دقیقه پیش", "دیروز", then a short Jalali date. */
export function formatRelativeTime(timestamp: number, now = Date.now()) {
  const seconds = Math.round((timestamp - now) / 1_000);
  const abs = Math.abs(seconds);
  if (abs < 45) return "همین حالا";
  const formatter = new Intl.RelativeTimeFormat("fa-IR", { numeric: "auto" });
  if (abs < 3_600) return formatter.format(Math.round(seconds / 60), "minute");
  if (abs < 86_400) return formatter.format(Math.round(seconds / 3_600), "hour");
  if (abs < 7 * 86_400) return formatter.format(Math.round(seconds / 86_400), "day");
  return new Intl.DateTimeFormat("fa-IR", { day: "numeric", month: "long" }).format(timestamp);
}

export type StudioDateGroup = { label: string; items: StudioItem[] };

/** Groups newest-first items into Today / Yesterday / This week / older months. */
export function groupStudioItemsByDate(
  items: StudioItem[],
  now = Date.now()
): StudioDateGroup[] {
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const today = startOfToday.getTime();
  const yesterday = today - 86_400_000;
  const weekAgo = today - 6 * 86_400_000;
  const groups = new Map<string, StudioItem[]>();
  const monthFormatter = new Intl.DateTimeFormat("fa-IR", {
    year: "numeric",
    month: "long",
  });

  for (const item of items) {
    const label =
      item.createdAt >= today
        ? "امروز"
        : item.createdAt >= yesterday
          ? "دیروز"
          : item.createdAt >= weekAgo
            ? "هفته گذشته"
            : monthFormatter.format(item.createdAt);
    const bucket = groups.get(label);
    if (bucket) bucket.push(item);
    else groups.set(label, [item]);
  }

  return Array.from(groups, ([label, groupItems]) => ({
    label,
    items: groupItems,
  }));
}

export type StudioRun = { key: string; createdAt: number; items: StudioItem[] };

/**
 * Turns newest-first items into oldest-first runs: one run per request, so
 * a 4-image batch reads as a single row in the feed.
 */
export function groupStudioRuns(items: StudioItem[]): StudioRun[] {
  const runs = new Map<string, StudioRun>();
  for (const item of items) {
    const batchId = typeof item.params.batchId === "string" ? item.params.batchId : null;
    const key = batchId ?? item.id;
    const run = runs.get(key);
    if (run) {
      run.items.push(item);
      run.createdAt = Math.min(run.createdAt, item.createdAt);
    } else {
      runs.set(key, { key, createdAt: item.createdAt, items: [item] });
    }
  }
  const batchIndex = (item: StudioItem) =>
    typeof item.params.batchIndex === "number" ? item.params.batchIndex : 0;
  return Array.from(runs.values())
    .map((run) => ({ ...run, items: run.items.sort((a, b) => batchIndex(a) - batchIndex(b)) }))
    .sort((a, b) => a.createdAt - b.createdAt);
}

/** Label for a day divider, e.g. "امروز" or "۱۷ مهر". */
export function formatDayLabel(timestamp: number, now = Date.now()) {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  if (timestamp >= start.getTime()) return "امروز";
  if (timestamp >= start.getTime() - 86_400_000) return "دیروز";
  return new Intl.DateTimeFormat("fa-IR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(timestamp);
}

export function isSameDay(a: number, b: number) {
  return new Date(a).toDateString() === new Date(b).toDateString();
}
