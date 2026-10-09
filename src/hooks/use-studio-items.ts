"use client";

import {
  STUDIO_LIMITS,
  type StudioItem,
  type StudioKind,
} from "@/lib/studio/types";
import { normalizeSearchText } from "@/lib/studio/search";
import { useCallback, useEffect, useRef, useState } from "react";

function matchesQuery(item: StudioItem, query: string) {
  const needle = normalizeSearchText(query);
  if (!needle) return true;
  return normalizeSearchText(
    [item.title, item.prompt, item.text ?? "", item.correctedText ?? ""].join(" ")
  ).includes(needle);
}

function sortNewestFirst(items: StudioItem[]) {
  return items.sort(
    (a, b) => b.createdAt - a.createdAt || b.id.localeCompare(a.id)
  );
}

/**
 * Loads Studio items page by page and keeps them live with main-process
 * change events, so generations started anywhere appear immediately.
 */
export function useStudioItems(options: { kind?: StudioKind; query?: string } = {}) {
  const { kind } = options;
  const query = options.query?.trim() ?? "";
  const [items, setItems] = useState<StudioItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef(0);

  const load = useCallback(
    async (before?: number) => {
      const request = ++requestRef.current;
      if (before === undefined) setIsLoading(true);
      try {
        const page = await window.desktop.studio.list({
          kind,
          query: query || undefined,
          before,
          limit: STUDIO_LIMITS.listPageSize,
        });
        if (request !== requestRef.current) return;
        setItems((current) => {
          if (before === undefined) return page;
          const known = new Set(current.map((item) => item.id));
          return [...current, ...page.filter((item) => !known.has(item.id))];
        });
        setHasMore(page.length === STUDIO_LIMITS.listPageSize);
        setError(null);
      } catch (cause) {
        if (request !== requestRef.current) return;
        setError(cause instanceof Error ? cause.message : "بارگذاری ناموفق بود.");
      } finally {
        if (request === requestRef.current) setIsLoading(false);
      }
    },
    [kind, query]
  );

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const offChange = window.desktop.studio.onItemChange((item) => {
      if (kind && item.kind !== kind) return;
      setItems((current) => {
        const index = current.findIndex((candidate) => candidate.id === item.id);
        if (index >= 0) {
          if (current[index].updatedAt > item.updatedAt) return current;
          const next = current.slice();
          next[index] = item;
          return next;
        }
        if (!matchesQuery(item, query)) return current;
        return sortNewestFirst([item, ...current]);
      });
    });
    const offDelete = window.desktop.studio.onItemDelete((id) => {
      setItems((current) => current.filter((item) => item.id !== id));
    });
    return () => {
      offChange();
      offDelete();
    };
  }, [kind, query]);

  const loadMore = useCallback(() => {
    const oldest = items.at(-1);
    if (oldest) void load(oldest.createdAt);
  }, [items, load]);

  return {
    items,
    isLoading,
    hasMore,
    error,
    loadMore,
    refresh: () => void load(),
  };
}
