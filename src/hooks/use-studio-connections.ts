"use client";

import type { StudioConnections } from "@/lib/studio/types";
import { useCallback, useEffect, useState } from "react";

let cached: StudioConnections | null = null;
const listeners = new Set<(value: StudioConnections) => void>();

export function publishStudioConnections(value: StudioConnections) {
  cached = value;
  for (const listener of listeners) listener(value);
}

/** Status of optional direct providers (Google AI Studio, ElevenLabs). */
export function useStudioConnections() {
  const [connections, setConnections] = useState<StudioConnections | null>(cached);

  const refresh = useCallback(async () => {
    try {
      publishStudioConnections(await window.desktop.studio.connections.getStatus());
    } catch {
      // Status is advisory; generation reports missing keys itself.
    }
  }, []);

  useEffect(() => {
    listeners.add(setConnections);
    void refresh();
    window.addEventListener("focus", refresh);
    return () => {
      listeners.delete(setConnections);
      window.removeEventListener("focus", refresh);
    };
  }, [refresh]);

  return { connections, refresh };
}
