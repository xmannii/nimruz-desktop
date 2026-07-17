/**
 * Detects broad, read-only architecture/repository investigations that benefit
 * from isolating exploration in a research agent before the main agent acts.
 */
export function shouldPreferResearchSubagent(text: string): boolean {
  const value = text.trim();
  if (!value) return false;

  if (
    /(بدون\s+(?:استفاده\s+از\s+)?(?:ساب\s*ایجنت|دستیار\s+پژوهشی)|(?:do\s+not|don't|without)\s+(?:use|using\s+)?(?:a\s+)?subagent)/i.test(
      value
    )
  ) {
    return false;
  }

  const hasBroadSubject =
    /(?:سایت|وب[‌\s-]*سایت|کدبیس|مخزن|معماری|ساختار\s+(?:کلی|پروژه|سیستم)|\b(?:site|website|codebase|repository|repo|architecture)\b)/i.test(
      value
    ) ||
    /(?:کل|تمام)\s+پروژه|\b(?:whole|entire)\s+project\b/i.test(value);

  const asksForInvestigation =
    /(?:بررسی|تحلیل|کاوش|نحوه\s+کار|چطور\s+کار|معماری|ساختار)/i.test(value) ||
    /\b(?:inspect|investigate|analy[sz]e|review|explore|understand|how\s+(?:the\s+)?\w+\s+works?)\b/i.test(
      value
    );

  return hasBroadSubject && asksForInvestigation;
}
