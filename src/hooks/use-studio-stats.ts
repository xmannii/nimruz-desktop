"use client";

import type { StudioStats } from "@/lib/studio/types";
import { useEffect, useState } from "react";

/** Studio counts and spend, refreshed shortly after any item changes. */
export function useStudioStats() {
  const [stats, setStats] = useState<StudioStats | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;
    const load = () =>
      window.desktop.studio
        .getStats()
        .then((value) => {
          if (!cancelled) setStats(value);
        })
        .catch(() => undefined);
    const schedule = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(load, 400);
    };
    void load();
    const offChange = window.desktop.studio.onItemChange(schedule);
    const offDelete = window.desktop.studio.onItemDelete(schedule);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      offChange();
      offDelete();
    };
  }, []);

  return stats;
}
