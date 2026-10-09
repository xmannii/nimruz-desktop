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
    <div className="flex items-center gap-2 px-1 text-xs text-muted-foreground">
      <KeyRoundIcon className="size-3.5 shrink-0" />
      <span className="min-w-0 flex-1">برای ساخت با OpenRouter، کلید API را در تنظیمات وارد کنید.</span>
      <Button
        size="xs"
        variant="outline"
        render={
          <Link to="/settings/models/providers" search={{ provider: OPENROUTER_PROVIDER_ID }} />
        }
      >
        افزودن کلید
      </Button>
    </div>
  );
}
