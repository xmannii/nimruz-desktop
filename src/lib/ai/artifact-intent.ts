/**
 * Detects user messages that should produce a previewable artifact
 * (not a chat dump). Used to force `create_artifact` on the first step.
 */
export function shouldForceCreateArtifact(text: string): boolean {
  const t = text.trim();
  if (!t) return false;

  // Explicit deliverable nouns (FA + EN)
  if (
    /(فلوچارت|دیاگرام|نمودار|آرتیفکت|\bflowchart\b|\bdiagram\b|\bmermaid\b|\bmockup\b|\bartifact\b)/i.test(
      t
    )
  ) {
    return true;
  }

  // Draw / sketch verbs — user wants a visual deliverable
  if (/(^|[\s،,])(بکش|بکشید|رسم\s*کن(?:ید)?|طراحی\s*کن(?:ید)?)([\s،,]|$)/.test(t)) {
    return true;
  }
  if (/\b(draw|sketch)\b/i.test(t)) {
    return true;
  }

  // Build a page / UI / SVG / HTML deliverable
  if (
    /(لندینگ|صفحه(?:[‌ ]*html)?|ui\s*mock|landing\s*page|\bhtml\b|\bsvg\b)/i.test(
      t
    ) &&
    /(بساز|بسازید|درست\s*کن|generate|create|make|build)/i.test(t)
  ) {
    return true;
  }

  // "create/make a … report/sample/table" style asks for a standalone doc
  if (
    /\b(create|make|generate|build)\b.{0,40}\b(report|write-?up|sample|snippet|table|csv|json)\b/i.test(
      t
    )
  ) {
    return true;
  }

  return false;
}
