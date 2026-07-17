const rtf = new Intl.RelativeTimeFormat("fa-IR", { numeric: "auto" });
const shortDate = new Intl.DateTimeFormat("fa-IR", { dateStyle: "short" });

export function formatRelativeTime(timestamp: number): string {
  const diffMs = timestamp - Date.now();
  const diffSec = Math.round(diffMs / 1000);
  const diffMin = Math.round(diffSec / 60);
  const diffHour = Math.round(diffMin / 60);
  const diffDay = Math.round(diffHour / 24);

  if (Math.abs(diffSec) < 60) return rtf.format(diffSec, "second");
  if (Math.abs(diffMin) < 60) return rtf.format(diffMin, "minute");
  if (Math.abs(diffHour) < 24) return rtf.format(diffHour, "hour");
  if (Math.abs(diffDay) < 7) return rtf.format(diffDay, "day");

  return shortDate.format(new Date(timestamp));
}
