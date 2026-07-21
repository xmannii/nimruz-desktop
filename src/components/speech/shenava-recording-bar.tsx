"use client";

import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { Trash2Icon } from "lucide-react";

const WAVE_HEIGHTS = [
  8, 14, 20, 11, 24, 16, 9, 19, 13, 22, 10, 17, 7, 15, 21, 12,
];

function formatRecordingDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  const minutesLabel = minutes.toLocaleString("fa-IR", {
    minimumIntegerDigits: 2,
  });
  const secondsLabel = remainingSeconds.toLocaleString("fa-IR", {
    minimumIntegerDigits: 2,
  });
  return `${minutesLabel}:${secondsLabel}`;
}

export function ShenavaRecordingBar({
  seconds,
  onCancel,
}: {
  seconds: number;
  onCancel: () => void;
}) {
  return (
    <div dir="ltr" className="flex min-w-0 flex-1 items-center gap-2">
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="shrink-0 text-muted-foreground"
        aria-label="لغو و حذف ضبط"
        title="لغو و حذف ضبط"
        onClick={onCancel}
      >
        <Trash2Icon />
      </Button>

      <span className="w-12 shrink-0 text-center text-xs tabular-nums text-muted-foreground">
        {formatRecordingDuration(seconds)}
      </span>

      <div
        aria-hidden
        className="flex h-7 min-w-0 flex-1 items-center justify-center gap-0.5 overflow-hidden"
      >
        {WAVE_HEIGHTS.map((height, index) => (
          <span
            key={`${height}-${index}`}
            className="recording-wave-bar w-1 shrink-0 rounded-full bg-destructive"
            style={{
              height,
              animationDelay: `${index * -70}ms`,
              animationDuration: `${620 + (index % 5) * 90}ms`,
            }}
          />
        ))}
      </div>

      <span
        dir="rtl"
        className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground"
      >
        <span>برای پایان</span>
        <Kbd>Space</Kbd>
      </span>
    </div>
  );
}
