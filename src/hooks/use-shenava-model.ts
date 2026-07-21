"use client";

import {
  INITIAL_SHENAVA_STATUS,
  type ShenavaModelKey,
  type ShenavaStatus,
} from "@/lib/speech/shenava";
import { useCallback, useEffect, useState } from "react";

export function useShenavaModel() {
  const [status, setStatus] = useState<ShenavaStatus>(
    INITIAL_SHENAVA_STATUS
  );
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    const next = await window.desktop.speech.shenava.getStatus();
    setStatus(next);
    setIsLoading(false);
    return next;
  }, []);

  useEffect(() => {
    let cancelled = false;
    const unsubscribe = window.desktop.speech.shenava.onStatusChange((next) => {
      if (!cancelled) {
        setStatus(next);
        setIsLoading(false);
      }
    });

    void refresh().catch(() => {
      if (!cancelled) setIsLoading(false);
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [refresh]);

  const download = useCallback(async (modelKey: ShenavaModelKey) => {
    const next = await window.desktop.speech.shenava.download(modelKey);
    setStatus(next);
    return next;
  }, []);

  const cancelDownload = useCallback(async () => {
    await window.desktop.speech.shenava.cancelDownload();
  }, []);

  const select = useCallback(async (modelKey: ShenavaModelKey) => {
    const next = await window.desktop.speech.shenava.select(modelKey);
    setStatus(next);
    return next;
  }, []);

  const remove = useCallback(async (modelKey: ShenavaModelKey) => {
    const next = await window.desktop.speech.shenava.remove(modelKey);
    setStatus(next);
    return next;
  }, []);

  return {
    status,
    isLoading,
    refresh,
    download,
    cancelDownload,
    select,
    remove,
  };
}
