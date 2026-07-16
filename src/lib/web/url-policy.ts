export const WEB_LIMITS = {
  fetchTimeoutMs: 15_000,
  maxResponseBytes: 2_000_000,
  maxCleanChars: 32_000,
  maxSearchResults: 8,
  searchTimeoutMs: 12_000,
} as const;

const PRIVATE_HOST_PATTERNS = [
  /^localhost$/i,
  /^127\.\d+\.\d+\.\d+$/,
  /^10\.\d+\.\d+\.\d+$/,
  /^192\.168\.\d+\.\d+$/,
  /^172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+$/,
  /^169\.254\.\d+\.\d+$/,
  /^0\.0\.0\.0$/,
  /^\[::1\]$/,
  /^\[fc/i,
  /^\[fd/i,
  /^\[fe80:/i,
  /\.local$/i,
];

export function assertPublicHttpUrl(rawUrl: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error("Invalid URL.");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Only http and https URLs are allowed.");
  }

  if (parsed.username || parsed.password) {
    throw new Error("URLs with credentials are not allowed.");
  }

  const hostname = parsed.hostname.replace(/^\[|\]$/g, "");
  if (PRIVATE_HOST_PATTERNS.some((pattern) => pattern.test(hostname))) {
    throw new Error("Private or local URLs are not allowed.");
  }

  return parsed;
}

export const WEB_USER_AGENT =
  "Mozilla/5.0 (compatible; NimruzBot/1.0; +https://github.com/xmannii/nimruz-desktop)";
