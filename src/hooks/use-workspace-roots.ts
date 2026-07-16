"use client";

import type { WorkspaceRoot } from "@/lib/workspace";
import { useCallback, useEffect, useState } from "react";
import { hasEventType, useWorkspaceEvents } from "./use-workspace-events";

/**
 * Loads the approved roots for a workspace and keeps them fresh when roots
 * change (via live `root-changed` events). Independent of the app-shell's
 * active workspace so it works for any workspace shown in a panel.
 */
export function useWorkspaceRoots(workspaceId: string | null) {
  const [roots, setRoots] = useState<WorkspaceRoot[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!workspaceId) {
      setRoots([]);
      setIsLoading(false);
      return;
    }
    try {
      const loaded =
        await window.desktop.storage.loadWorkspaceRoots(workspaceId);
      setRoots(loaded);
    } catch (error) {
      console.error("Failed to load workspace roots:", error);
    } finally {
      setIsLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    setIsLoading(true);
    void reload();
  }, [reload]);

  useWorkspaceEvents(workspaceId, (events) => {
    if (hasEventType(events, "root-changed")) void reload();
  });

  return { roots, isLoading, reload };
}
