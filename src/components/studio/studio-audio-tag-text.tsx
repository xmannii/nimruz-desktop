"use client";

import { splitAudioTags, type AudioTagTone } from "@/lib/studio/audio-tags";
import { cn } from "@/lib/utils";

/** Colour per tag group, shared by the badges and the editor highlight. */
export const AUDIO_TAG_TONE_CLASSES: Record<AudioTagTone, string> = {
  emotion: "bg-amber-500/15 text-amber-800 dark:text-amber-300",
  delivery: "bg-sky-500/15 text-sky-800 dark:text-sky-300",
  sound: "bg-violet-500/15 text-violet-800 dark:text-violet-300",
  pause: "bg-foreground/10 text-muted-foreground",
};

/** Renders a script with each audio tag as a small Persian badge. */
export function StudioAudioTagText({ text }: { text: string }) {
  return (
    <>
      {splitAudioTags(text).map((segment, index) =>
        segment.type === "text" ? (
          <span key={index}>{segment.value}</span>
        ) : (
          <span
            key={index}
            title={segment.raw}
            dir="rtl"
            className={cn(
              "mx-0.5 inline-flex items-center rounded-md px-1.5 align-baseline text-[11px] font-medium leading-5",
              AUDIO_TAG_TONE_CLASSES[segment.tone]
            )}
          >
            {segment.label}
          </span>
        )
      )}
    </>
  );
}

/** Highlight-only marks laid under a textarea; text itself stays invisible. */
export function StudioAudioTagHighlights({ text }: { text: string }) {
  return (
    <>
      {splitAudioTags(text).map((segment, index) =>
        segment.type === "text" ? (
          <span key={index}>{segment.value}</span>
        ) : (
          <mark
            key={index}
            className={cn("rounded-[5px] text-transparent", AUDIO_TAG_TONE_CLASSES[segment.tone])}
          >
            {segment.raw}
          </mark>
        )
      )}
      {/* Keeps a trailing newline's height in sync with the textarea. */}
      {"​"}
    </>
  );
}
