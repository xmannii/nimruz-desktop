"use client";

import { MessageResponse } from "@/components/ai-elements/message";
import {
  entryHighlights,
  type ChangelogEntry,
} from "@/lib/changelog";
import { cn } from "@/lib/utils";

export function formatChangelogVersionLabel(
  version: string,
  date: string | null
) {
  if (!date) return `v${version}`;
  return `v${version} · ${date}`;
}

export function ChangelogEntryCard({
  entry,
  compact = false,
  className,
}: {
  entry: ChangelogEntry;
  compact?: boolean;
  className?: string;
}) {
  const markdown = compact ? entryHighlights(entry.body) : entry.body;

  return (
    <article
      className={cn(
        "rounded-2xl border border-border/70 bg-muted/20 px-4 py-3",
        className
      )}
    >
      <p
        className="font-mono text-xs font-medium text-muted-foreground tabular-nums"
        dir="ltr"
      >
        {formatChangelogVersionLabel(entry.version, entry.date)}
      </p>
      <div className="mt-2 text-sm leading-6 text-foreground" dir="rtl">
        <MessageResponse className="text-sm leading-6">
          {markdown}
        </MessageResponse>
      </div>
    </article>
  );
}
