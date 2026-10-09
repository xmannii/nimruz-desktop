"use client";

import { Button } from "@/components/ui/button";
import { OPENROUTER_PROVIDER_ID } from "@/lib/models/catalog";
import { Link } from "@tanstack/react-router";
import { KeyRoundIcon } from "lucide-react";
import { useEffect, useState } from "react";

/** Whether the shared OpenRouter key is configured; null while loading. */
export function useOpenRouterKeyConfigured() {
  const [configured, setConfigured] = useState<boolean | null>(null);
  useEffect(() => {
    let cancelled = false;
    const check = () =>
      window.desktop.credentials
        .getStatus(OPENROUTER_PROVIDER_ID)
        .then((status) => {
          if (!cancelled) setConfigured(status.configured);
        })
        .catch(() => {
          if (!cancelled) setConfigured(false);
        });
    void check();
    window.addEventListener("focus", check);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", check);
    };
  }, []);
  return configured;
}

export function StudioKeyNotice() {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-amber-500/25 bg-amber-500/8 p-3 ps-4">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400">
        <KeyRoundIcon className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">برای ساخت، کلید OpenRouter لازم است</p>
        <p className="text-xs text-muted-foreground">
          استودیو از همان کلید OpenRouter بخش گفتگو استفاده می‌کند.
        </p>
      </div>
      <Button
        size="sm"
        variant="outline"
        className="rounded-full"
        render={
          <Link
            to="/settings/models/providers"
            search={{ provider: OPENROUTER_PROVIDER_ID }}
          />
        }
      >
        افزودن کلید
      </Button>
    </div>
  );
}
