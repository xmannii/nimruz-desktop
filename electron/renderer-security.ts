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
