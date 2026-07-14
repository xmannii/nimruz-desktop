"use client";

import { Button } from "@/components/ui/button";
import { MoonIcon, SunIcon } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  // Defer theme-dependent UI until after mount so SSR matches the client.
  const isDark = mounted && resolvedTheme === "dark";

  return (
    <Button
      variant="outline"
      size="sm"
      className="h-8 gap-1.5 px-2.5 text-xs"
      aria-label={isDark ? "تم روشن" : "تم تیره"}
      disabled={!mounted}
      onClick={() => setTheme(isDark ? "light" : "dark")}
    >
      {isDark ? (
        <>
          <SunIcon className="size-3.5" />
          روشن
        </>
      ) : (
        <>
          <MoonIcon className="size-3.5" />
          تیره
        </>
      )}
    </Button>
  );
}
