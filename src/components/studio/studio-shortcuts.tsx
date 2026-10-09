"use client";

import type { StudioTab } from "@/lib/studio/format";
import { useNavigate } from "@tanstack/react-router";
import { AudioLinesIcon, FileAudioIcon, FilmIcon, ImageIcon } from "lucide-react";

const SHORTCUTS: Array<{ tab: StudioTab; label: string; icon: typeof ImageIcon }> = [
  { tab: "image", label: "ساخت تصویر", icon: ImageIcon },
  { tab: "video", label: "ساخت ویدیو", icon: FilmIcon },
  { tab: "speech", label: "متن به صدا", icon: AudioLinesIcon },
  { tab: "transcribe", label: "رونویسی صوت", icon: FileAudioIcon },
];

/**
 * Quiet entry points into Studio under the empty chat composer. Whatever
 * the person already typed carries over as the Studio prompt.
 */
export function StudioShortcuts({ text }: { text: string }) {
  const navigate = useNavigate();
  const prompt = text.trim();

  return (
    <div dir="rtl" className="mt-3 flex flex-wrap items-center gap-1.5">
      <span className="me-1 text-xs text-muted-foreground">یا در استودیو:</span>
      {SHORTCUTS.map(({ tab, label, icon: Icon }) => (
        <button
          key={tab}
          type="button"
          className="inline-flex h-7 items-center gap-1.5 rounded-full border border-border/70 px-2.5 text-xs text-muted-foreground transition-colors hover:border-border hover:bg-muted hover:text-foreground"
          title={prompt && tab !== "transcribe" ? "متن فعلی به استودیو منتقل می‌شود" : undefined}
          onClick={() =>
            void navigate({
              to: "/studio",
              search: { tab, prompt: prompt && tab !== "transcribe" ? prompt : undefined },
            })
          }
        >
          <Icon className="size-3.5" />
          {label}
        </button>
      ))}
    </div>
  );
}
