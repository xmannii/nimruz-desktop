"use client";

import type { WorkspaceEvent, WorkspaceEventType } from "@/lib/workspace";
import { useEffect, useRef } from "react";

/**
 * Subscribe to live workspace events for a specific workspace. Events are
 * buffered and flushed after a short debounce so bursts of tool activity
 * trigger a single refresh instead of one per event.
 */
export function useWorkspaceEvents(
  workspaceId: string | null,
  onEvents: (events: WorkspaceEvent[]) => void,
  options?: { debounceMs?: number }
): void {
  const handlerRef = useRef(onEvents);
  handlerRef.current = onEvents;
  const debounceMs = options?.debounceMs ?? 120;

  useEffect(() => {
    if (!workspaceId) return;
    const subscribe = window.desktop?.workspaceEvents?.subscribe;
    if (!subscribe) return;

    let buffer: WorkspaceEvent[] = [];
    let timer: ReturnType<typeof setTimeout> | null = null;

    const flush = () => {
      timer = null;
      if (buffer.length === 0) return;
      const batch = buffer;
      buffer = [];
      handlerRef.current(batch);
    };

    const unsubscribe = subscribe((event) => {
      // Run/approval events may have a null workspace; keep only matching ones.
      if (event.workspaceId !== workspaceId) return;
      buffer.push(event);
      if (timer) clearTimeout(timer);
      timer = setTimeout(flush, debounceMs);
    });

    return () => {
      if (timer) clearTimeout(timer);
      unsubscribe();
    };
  }, [workspaceId, debounceMs]);
}

/** Returns true when any event in the batch matches one of the given types. */
export function hasEventType(
  events: WorkspaceEvent[],
  ...types: WorkspaceEventType[]
): boolean {
  return events.some((event) => types.includes(event.type));
}
