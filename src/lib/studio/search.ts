const CHARACTER_MAP: Record<string, string> = {
  "ي": "ی", // Arabic yeh → Persian yeh
  "ى": "ی", // Alef maksura → Persian yeh
  "ك": "ک", // Arabic kaf → Persian kaf
  "ة": "ه", // Teh marbuta → heh
  "أ": "ا", // Alef with hamza above → alef
  "إ": "ا", // Alef with hamza below → alef
  "ؤ": "و", // Waw with hamza → waw
};

/**
 * Folds Persian/Arabic spelling variants so search matches what people
 * actually type: ي/ی and ك/ک, Persian or Arabic digits, diacritics, and
 * inconsistent half-spaces ("می‌خواهم", "می خواهم", "میخواهم").
 */
export function normalizeSearchText(value: string) {
  return value
    .toLocaleLowerCase()
    .replace(/[يىكةأإؤ]/g, (char) => CHARACTER_MAP[char] ?? char)
    .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 0x06f0))
    .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x0660))
    .replace(/[ً-ٰٟـ]/g, "")
    .replace(/[\s‌‍‎‏]+/g, "");
}
