export function isTrustedRendererUrl(candidate: string, trustedUrl: string) {
  try {
    const candidateUrl = new URL(candidate);
    const expectedUrl = new URL(trustedUrl);
    return candidateUrl.origin === expectedUrl.origin;
  } catch {
    return false;
  }
}

export function isSafeExternalHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return (
      (url.protocol === "https:" || url.protocol === "http:") &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}

/**
 * Permissions granted to the trusted renderer. Clipboard writes back the copy
 * buttons (messages and code blocks); clipboard reads stay denied.
 */
export function isAllowedRendererPermission(
  permission: string,
  mediaTypes: readonly string[] = []
) {
  if (permission === "clipboard-sanitized-write") return true;
  return (
    permission === "media" &&
    mediaTypes.includes("audio") &&
    !mediaTypes.includes("video")
  );
}
