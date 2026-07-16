"use client";

import type { Expert } from "@/lib/settings/experts";
import { cn } from "@/lib/utils";
import { useEffect, useRef } from "react";

type ExpertSlashSuggestionsProps = {
  suggestions: Expert[];
  highlightIndex: number;
  onHighlight: (index: number) => void;
  onSelect: (expert: Expert) => void;
};

export function ExpertSlashSuggestions({
  suggestions,
  highlightIndex,
  onHighlight,
  onSelect,
}: ExpertSlashSuggestionsProps) {
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    const item = listRef.current?.children.item(highlightIndex);
    item?.scrollIntoView({ block: "nearest" });
  }, [highlightIndex]);

  if (suggestions.length === 0) return null;

  return (
    <div
      dir="rtl"
      className="absolute inset-x-0 bottom-full z-40 mb-2 overflow-hidden rounded-2xl border border-border bg-popover shadow-xl"
    >
      <div className="border-b border-border/60 px-3 py-2">
        <p className="text-xs font-medium text-foreground">انتخاب متخصص</p>
        <p className="mt-0.5 text-[11px] leading-5 text-muted-foreground">
          <span dir="ltr" className="inline-block">
            /
          </span>
          {" "}را در ابتدای پیام بنویسید · ↑↓ · Enter یا Tab · سپس درخواست خود را
          بنویسید
        </p>
      </div>

      <ul
        ref={listRef}
        role="listbox"
        aria-label="متخصص‌ها"
        aria-activedescendant={
          suggestions[highlightIndex]
            ? `expert-suggestion-${suggestions[highlightIndex].id}`
            : undefined
        }
        className="max-h-56 overflow-y-auto p-1.5"
      >
        {suggestions.map((expert, index) => {
          const isHighlighted = index === highlightIndex;

          return (
            <li key={expert.id}>
              <button
                id={`expert-suggestion-${expert.id}`}
                type="button"
                role="option"
                aria-selected={isHighlighted}
                className={cn(
                  "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-right transition-colors hover:bg-muted",
                  isHighlighted && "bg-muted"
                )}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => onHighlight(index)}
                onClick={() => onSelect(expert)}
              >
                <span className="min-w-0 flex-1">
                  <strong className="block text-sm font-medium">
                    {expert.name}
                  </strong>
                  <span className="mt-0.5 block line-clamp-2 text-xs leading-5 text-muted-foreground">
                    {expert.description}
                  </span>
                </span>
                <code
                  dir="ltr"
                  className="shrink-0 rounded-md bg-muted px-2 py-1 text-xs font-medium tabular-nums"
                >
                  /{expert.slug}
                </code>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
