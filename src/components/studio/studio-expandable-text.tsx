"use client";

import { cn } from "@/lib/utils";
import { useLayoutEffect, useRef, useState } from "react";

/**
 * Shows a short preview of long text with an inline "more / less" toggle.
 * Expanded text scrolls inside a bounded box so one long transcript or
 * script never pushes the rest of the list off screen.
 */
export function StudioExpandableText({
  text,
  lines = 2,
  className,
}: {
  text: string;
  lines?: 2 | 3;
  className?: string;
}) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element || expanded) return;
    const check = () => setOverflows(element.scrollHeight > element.clientHeight + 1);
    check();
    const observer = new ResizeObserver(check);
    observer.observe(element);
    return () => observer.disconnect();
  }, [text, expanded]);

  return (
    <div className={className}>
      <p
        ref={ref}
        dir="auto"
        className={cn(
          "text-[13.5px] leading-6 whitespace-pre-wrap text-foreground/90",
          expanded
            ? "max-h-72 overflow-y-auto overscroll-contain rounded-lg bg-muted/40 p-2.5"
            : lines === 3
              ? "line-clamp-3"
              : "line-clamp-2"
        )}
      >
        {text}
      </p>
      {overflows || expanded ? (
        <button
          type="button"
          className="mt-0.5 text-[11.5px] font-medium text-muted-foreground transition-colors hover:text-foreground"
          aria-expanded={expanded}
          onClick={(event) => {
            event.stopPropagation();
            setExpanded((value) => !value);
          }}
        >
          {expanded ? "نمایش کمتر" : "نمایش بیشتر"}
        </button>
      ) : null}
    </div>
  );
}

/** "۱٬۲۳۴ واژه · حدود ۵ دقیقه مطالعه" for long text. */
export function textStats(text: string) {
  const words = text.split(/\s+/).filter(Boolean).length;
  const minutes = Math.max(1, Math.round(words / 200));
  return { words, minutes };
}
