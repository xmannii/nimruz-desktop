"use client";

import type { StudioModelCatalog } from "@/lib/studio/types";
import { useCallback, useEffect, useState } from "react";

let cachedCatalog: StudioModelCatalog | null = null;
let pending: Promise<StudioModelCatalog> | null = null;
const listeners = new Set<(catalog: StudioModelCatalog) => void>();

function fetchCatalog(force = false) {
  if (!force && pending) return pending;
  pending = window.desktop.studio
    .getCatalog(force)
    .then((catalog) => {
      cachedCatalog = catalog;
      for (const listener of listeners) listener(catalog);
      return catalog;
    })
    .finally(() => {
      pending = null;
    });
  return pending;
}

/** Shared OpenRouter (and ElevenLabs) media model catalog for Studio. */
export function useStudioCatalog() {
  const [catalog, setCatalog] = useState<StudioModelCatalog | null>(cachedCatalog);
  const [isLoading, setIsLoading] = useState(!cachedCatalog);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listeners.add(setCatalog);
    if (!cachedCatalog) {
      void fetchCatalog()
        .then(() => setError(null))
        .catch((cause: unknown) =>
          setError(cause instanceof Error ? cause.message : "دریافت مدل‌ها ناموفق بود.")
        )
        .finally(() => setIsLoading(false));
    }
    return () => {
      listeners.delete(setCatalog);
    };
  }, []);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      await fetchCatalog(true);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "دریافت مدل‌ها ناموفق بود.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { catalog, isLoading, error, refresh };
}
