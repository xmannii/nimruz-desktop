import type { CredentialStatus } from "@/lib/desktop-api";
import { useCallback, useEffect, useState } from "react";

export function useCredentialStatus(enabled = true) {
  const [status, setStatus] = useState<CredentialStatus | null>(null);
  const [isLoading, setIsLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!enabled) return;

    setIsLoading(true);
    setError(null);

    try {
      setStatus(await window.desktop.credentials.getStatus());
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "خواندن وضعیت کلید ممکن نشد."
      );
      setStatus(null);
    } finally {
      setIsLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const needsApiKey =
    status !== null && (!status.configured || !status.secure);

  return { status, isLoading, error, needsApiKey, refresh };
}
