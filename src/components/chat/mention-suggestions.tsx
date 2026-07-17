"use client";

import { cn } from "@/lib/utils";
import type { WorkspaceFileEntry } from "@/lib/workspace";
import { FolderIcon, FileIcon, LayersIcon } from "lucide-react";

export type MentionSuggestion =
  | { kind: "workspace"; value: string; label: string }
  | { kind: "file"; value: string; label: string; entry: WorkspaceFileEntry };

type MentionSuggestionsProps = {
  suggestions: MentionSuggestion[];
  highlightIndex: number;
  onHighlight: (index: number) => void;
  onSelect: (suggestion: MentionSuggestion) => void;
};

export function MentionSuggestions({
  suggestions,
  highlightIndex,
  onHighlight,
  onSelect,
}: MentionSuggestionsProps) {
  if (suggestions.length === 0) return null;
  return (
    <div
      dir="rtl"
      className="absolute bottom-full left-0 right-0 z-30 mb-2 max-h-56 overflow-y-auto rounded-xl border border-border bg-popover p-1 shadow-lg"
    >
      {suggestions.map((suggestion, index) => {
        const isActive = index === highlightIndex;
        const Icon =
          suggestion.kind === "workspace"
            ? LayersIcon
            : suggestion.entry.kind === "directory"
              ? FolderIcon
              : FileIcon;
        return (
          <button
            key={suggestion.value}
            type="button"
            onMouseEnter={() => onHighlight(index)}
            onMouseDown={(event) => {
              event.preventDefault();
              onSelect(suggestion);
            }}
            className={cn(
              "flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-right text-sm",
              isActive ? "bg-accent text-accent-foreground" : "hover:bg-muted/60"
            )}
          >
            <Icon className="size-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate">{suggestion.label}</span>
          </button>
        );
      })}
    </div>
  );
}
