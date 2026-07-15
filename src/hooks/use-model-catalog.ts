"use client";

import {
  findModelConfig,
  getDefaultModelRef,
  groupEnabledModels,
  isPickableModel,
  type ModelCatalogSnapshot,
  type ModelConfig,
  type ProviderConfig,
  type ProviderModelRef,
} from "@/lib/models/catalog";
import { useCallback, useEffect, useMemo, useState } from "react";

export function useModelCatalog() {
  const [catalog, setCatalog] = useState<ModelCatalogSnapshot>({
    providers: [],
    models: [],
  });
  const [isHydrated, setIsHydrated] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const next = await window.desktop.providers.listCatalog();
      setCatalog(next);
      setError(null);
      return next;
    } catch (cause) {
      const message =
        cause instanceof Error
          ? cause.message
          : "بارگذاری فهرست مدل‌ها ممکن نشد.";
      setError(message);
      throw cause;
    } finally {
      setIsHydrated(true);
    }
  }, []);

  useEffect(() => {
    void refresh().catch(() => {
      /* error already stored */
    });
  }, [refresh]);

  const defaultRef = useMemo(
    () => getDefaultModelRef(catalog.models, catalog.providers),
    [catalog.models, catalog.providers]
  );

  const enabledGroups = useMemo(
    () => groupEnabledModels(catalog.models, catalog.providers),
    [catalog.models, catalog.providers]
  );

  const resolveModel = useCallback(
    (ref: ProviderModelRef | null | undefined): ModelConfig | undefined => {
      if (!ref) return undefined;
      const model = findModelConfig(catalog.models, ref);
      if (!model || !isPickableModel(model, catalog.providers)) return undefined;
      return model;
    },
    [catalog.models, catalog.providers]
  );

  const getProvider = useCallback(
    (id: string): ProviderConfig | undefined =>
      catalog.providers.find((provider) => provider.id === id),
    [catalog.providers]
  );

  const hasUsableModel = enabledGroups.some((group) => group.models.length > 0);

  return {
    providers: catalog.providers,
    models: catalog.models,
    catalog,
    isHydrated,
    error,
    defaultRef,
    enabledGroups,
    hasUsableModel,
    resolveModel,
    getProvider,
    refresh,
    setCatalog,
  };
}
