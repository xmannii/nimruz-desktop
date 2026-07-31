/**
 * Rich Telegram HTML guides for pairing, /start, and /help.
 * Uses Telegram HTML parse_mode tags only: b, i, code, a.
 */

import { TELEGRAM_BUTTONS } from "@/lib/telegram";
import { escapeTelegramHtml } from "@/lib/telegram-format";

export function buildTelegramPairedWelcomeMessage(options?: {
  botUsername?: string | null;
  workspaceTitle?: string | null;
}): string {
  const bot = options?.botUsername
    ? `@${escapeTelegramHtml(options.botUsername)}`
    : "ربات نیمروز";
  const workspace = options?.workspaceTitle
    ? escapeTelegramHtml(options.workspaceTitle)
    : "فضای کاری انتخاب‌شده";

  return [
    "✅ <b>نیمروز به این حساب متصل شد</b>",
    "",
    `ربات ${bot} از این لحظه فقط با <b>همین چت خصوصی</b> کار می‌کند و دستورها را روی کامپیوتر شما، در «${workspace}»، اجرا می‌کند.`,
    "",
    "━━━━━━━━━━━━",
    "<b>چطور شروع کنم؟</b>",
    "• یک پیام <b>متنی</b> بفرستید؛ مثلاً «خلاصه README را بگو»",
    "• <b>پیام صوتی</b> بفرستید تا با شنوا روی همین دستگاه رونویسی شود",
    "• <b>عکس</b> (مدل vision) یا <b>PDF / فایل متنی</b> ضمیمه کنید",
    "",
    "<b>دکمه‌های پایین چت</b>",
    `• ${escapeTelegramHtml(TELEGRAM_BUTTONS.newChat)} — گفت‌وگوی تازه`,
    `• ${escapeTelegramHtml(TELEGRAM_BUTTONS.chats)} — گفت‌وگوهای اخیر`,
    `• ${escapeTelegramHtml(TELEGRAM_BUTTONS.model)} — تعویض مدل`,
    `• ${escapeTelegramHtml(TELEGRAM_BUTTONS.status)} — وضعیت کار جاری`,
    `• ${escapeTelegramHtml(TELEGRAM_BUTTONS.stop)} — توقف اجرا`,
    `• ${escapeTelegramHtml(TELEGRAM_BUTTONS.help)} — همین راهنما`,
    "",
    "<b>امنیت و تأیید</b>",
    "خواندن فایل، جستجوی وب و ساخت آرتیفکت معمولاً مستقیم‌اند. نوشتن روی پروژه، ترمینال و کارهای حساس از تلگرام <b>دوباره تأیید</b> می‌خواهند.",
    "",
    "<b>خروجی فایل</b>",
    "اگر نیمروز یک گزارش یا فایل بسازد، اغلب به‌صورت <b>آرتیفکت</b> برایتان در همین چت ارسال می‌شود.",
    "",
    "نیمروز باید روی کامپیوتر روشن و آنلاین باشد — بستن پنجره اشکالی ندارد، ولی خود برنامه باید در حال اجرا بماند.",
    "",
    "هر وقت خواستید <code>/help</code> را بفرستید.",
  ].join("\n");
}

export function buildTelegramHelpMessage(options?: {
  botUsername?: string | null;
  workspaceTitle?: string | null;
  paired?: boolean;
}): string {
  const bot = options?.botUsername
    ? `@${escapeTelegramHtml(options.botUsername)}`
    : "ربات";
  const workspace = options?.workspaceTitle
    ? escapeTelegramHtml(options.workspaceTitle)
    : "فضای کاری تنظیم‌شده";

  const lines = [
    "☀️ <b>راهنمای دستیار تلگرام نیمروز</b>",
    "",
    `${bot} یک رلهٔ <b>محلی</b> است: پیام‌ها روی همین کامپیوتر پردازش می‌شوند، نه روی یک سرور ابری واسط.`,
    "",
    `<b>فضای کاری فعال:</b> ${workspace}`,
    "",
    "<b>ورودی‌های پشتیبانی‌شده</b>",
    "• متن — درخواست‌ها و دستورهای کاری",
    "• صوت — رونویسی محلی با شنوا (حداکثر حدود ۳ دقیقه)",
    "• تصویر — فقط اگر مدل vision فعال باشد",
    "• سند — PDF و فایل‌های متنی/کد (مثل md، ts، json، csv)",
    "",
    "<b>دکمه‌ها و دستورها</b>",
    `• ${escapeTelegramHtml(TELEGRAM_BUTTONS.newChat)} یا <code>/new</code>`,
    `• ${escapeTelegramHtml(TELEGRAM_BUTTONS.chats)} یا <code>/chats</code>`,
    `• ${escapeTelegramHtml(TELEGRAM_BUTTONS.model)} یا <code>/model</code>`,
    `• ${escapeTelegramHtml(TELEGRAM_BUTTONS.status)} یا <code>/status</code>`,
    `• ${escapeTelegramHtml(TELEGRAM_BUTTONS.stop)} یا <code>/stop</code>`,
    `• ${escapeTelegramHtml(TELEGRAM_BUTTONS.help)} یا <code>/help</code>`,
    "",
    "<b>نکته‌های کاربردی</b>",
    "• برای فایل/گزارش، نیمروز ترجیح می‌دهد <b>آرتیفکت</b> بسازد و همان را برایتان بفرستد",
    "• کارهای نوشتن/ترمینال ممکن است دکمهٔ ✅ تأیید / 🚫 رد نشان دهند",
    "• فقط حساب جفت‌شده پذیرفته می‌شود",
  ];

  if (!options?.paired) {
    lines.push(
      "",
      "⚠️ هنوز به این نیمروز جفت نشده‌اید. از داخل برنامه مسیر <b>تنظیمات ← تلگرام ← جفت‌کردن حساب</b> را باز کنید و لینک امن Start را بزنید."
    );
  } else {
    lines.push(
      "",
      "آمادهٔ کار است — یک پیام بفرستید تا شروع کنیم."
    );
  }

  return lines.join("\n");
}

/** Shown when someone opens the bot without a valid one-time pairing code. */
export function buildTelegramUnpairedStartMessage(options?: {
  botUsername?: string | null;
}): string {
  const bot = options?.botUsername
    ? `@${escapeTelegramHtml(options.botUsername)}`
    : "این ربات";

  return [
    "👋 <b>سلام! من دستیار تلگرام نیمروز هستم</b>",
    "",
    `${bot} کارهای ایجنت را <b>روی کامپیوتر شما</b> اجرا می‌کند — وقتی برنامهٔ نیمروز روشن باشد.`,
    "",
    "🔒 برای امنیت، فقط حسابی که از داخل نیمروز <b>جفت</b> شده باشد پذیرفته می‌شود.",
    "",
    "<b>جفت‌سازی در ۳ قدم</b>",
    "۱. نیمروز دسکتاپ را باز کنید",
    "۲. بروید به <b>تنظیمات ← تلگرام</b>",
    "۳. دکمهٔ «بازکردن ربات و جفت‌سازی» را بزنید و همین چت را Start کنید",
    "",
    "اگر همین حالا لینک جفت‌سازی را از برنامه باز کرده‌اید و هنوز وصل نشد، لینک را دوباره از تنظیمات بگیرید — کد قبلی ممکن است منقضی یا مصرف شده باشد.",
    "",
    "پس از اتصال، راهنمای کامل با <code>/help</code> در دسترس است.",
  ].join("\n");
}
