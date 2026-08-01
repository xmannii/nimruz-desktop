const PERSIAN_TEXT = /[\u0600-\u06ff]/;

function collectErrorDetails(error: unknown, seen = new Set<unknown>()): string[] {
  if (error == null || seen.has(error)) return [];
  seen.add(error);

  if (typeof error === "string") return [error];
  if (typeof error !== "object") return [];

  const record = error as Record<string, unknown>;
  const details: string[] = [];
  for (const key of ["name", "message", "code", "errno"] as const) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) details.push(value.trim());
  }
  details.push(...collectErrorDetails(record.cause, seen));
  details.push(...collectErrorDetails(record.error, seen));
  return details;
}

export function getTelegramErrorMessage(
  error: unknown,
  fallback =
    "اتصال به تلگرام برقرار نشد. اینترنت و تنظیمات اتصال را بررسی کنید و دوباره تلاش کنید."
): string {
  const details = collectErrorDetails(error);
  const persian = details.find((detail) => PERSIAN_TEXT.test(detail));
  if (persian) {
    const firstPersianCharacter = persian.search(PERSIAN_TEXT);
    return persian.slice(firstPersianCharacter).trim();
  }

  const text = details.join(" \n ").toLowerCase();

  if (
    text.includes("unauthorized") ||
    text.includes("invalid token") ||
    text.includes("401")
  ) {
    return "تلگرام این توکن را نپذیرفت. توکن را دوباره از BotFather کپی کنید.";
  }
  if (text.includes("conflict") && text.includes("getupdates")) {
    return "این ربات هم‌زمان در برنامه یا سرویس دیگری فعال است. نمونهٔ دیگر را متوقف کنید و دوباره تلاش کنید.";
  }
  if (text.includes("too many requests") || text.includes("429")) {
    return "تلگرام موقتاً درخواست‌های زیادی دریافت کرده است. کمی بعد دوباره تلاش کنید.";
  }
  if (
    text.includes("proxy") ||
    text.includes("err_tunnel_connection_failed") ||
    text.includes("err_socks_connection_failed")
  ) {
    return "اتصال از طریق پراکسی برقرار نشد. آدرس، درگاه و فعال‌بودن پراکسی را بررسی کنید.";
  }
  if (
    text.includes("timeout") ||
    text.includes("timed out") ||
    text.includes("etimedout") ||
    text.includes("aborterror") ||
    text.includes("timeouterror")
  ) {
    return "مهلت اتصال به تلگرام تمام شد. اینترنت یا پراکسی را بررسی کنید و دوباره تلاش کنید.";
  }
  if (
    text.includes("enotfound") ||
    text.includes("eai_again") ||
    text.includes("name_not_resolved")
  ) {
    return "نشانی تلگرام پیدا نشد. اتصال اینترنت یا DNS را بررسی کنید.";
  }
  if (
    text.includes("econnrefused") ||
    text.includes("connection refused")
  ) {
    return "اتصال رد شد. اگر پراکسی فعال است، مطمئن شوید اجرا می‌شود و درگاه آن درست است.";
  }
  if (
    text.includes("certificate") ||
    text.includes("cert_") ||
    text.includes("ssl") ||
    text.includes("tls")
  ) {
    return "اتصال امن به تلگرام تأیید نشد. ساعت سیستم و تنظیمات TLS یا پراکسی را بررسی کنید.";
  }
  if (
    text.includes("fetch failed") ||
    text.includes("failed to fetch") ||
    text.includes("network") ||
    text.includes("econnreset") ||
    text.includes("socket")
  ) {
    return fallback;
  }
  if (text.includes("not found") || text.includes("404")) {
    return "تلگرام ربات یا فایل درخواستی را پیدا نکرد. توکن و اتصال ربات را دوباره بررسی کنید.";
  }
  if (text.includes("bad request") || text.includes("400")) {
    return "تلگرام درخواست را نپذیرفت. تنظیمات ربات را بررسی کنید و دوباره تلاش کنید.";
  }

  return fallback;
}
