"use client";

import { Button } from "@/components/ui/button";
import { formatStudioDuration } from "@/lib/studio/format";
import { cn } from "@/lib/utils";
import { PauseIcon, PlayIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";

let activeAudio: HTMLAudioElement | null = null;

/** Minimal audio player; starting one clip pauses any other clip. */
export function StudioAudioPlayer({
  src,
  className,
  size = "default",
}: {
  src: string;
  className?: string;
  size?: "default" | "lg";
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    const audio = audioRef.current;
    return () => {
      if (audio && activeAudio === audio) activeAudio = null;
    };
  }, []);

  function toggle() {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      if (activeAudio && activeAudio !== audio) activeAudio.pause();
      activeAudio = audio;
      void audio.play().catch(() => setIsPlaying(false));
    } else {
      audio.pause();
    }
  }

  const progress = duration > 0 ? Math.min(100, (current / duration) * 100) : 0;

  return (
    <div
      dir="ltr"
      className={cn(
        "flex items-center gap-3 rounded-2xl bg-muted/70 p-1.5 pe-3",
        size === "lg" && "p-2 pe-4",
        className
      )}
    >
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => {
          setIsPlaying(false);
          setCurrent(0);
        }}
        onLoadedMetadata={(event) => {
          const value = event.currentTarget.duration;
          setDuration(Number.isFinite(value) ? value : 0);
        }}
        onTimeUpdate={(event) => setCurrent(event.currentTarget.currentTime)}
      />
      <Button
        type="button"
        size={size === "lg" ? "icon-lg" : "icon"}
        className="shrink-0 rounded-full"
        aria-label={isPlaying ? "توقف" : "پخش"}
        onClick={toggle}
      >
        {isPlaying ? <PauseIcon /> : <PlayIcon className="translate-x-px" />}
      </Button>
      <input
        type="range"
        min={0}
        max={duration || 0}
        step={0.01}
        value={current}
        aria-label="موقعیت پخش"
        disabled={!duration}
        className="h-1.5 min-w-0 flex-1 cursor-pointer appearance-none rounded-full bg-foreground/10 accent-primary [&::-webkit-slider-thumb]:size-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary"
        style={{
          backgroundImage: `linear-gradient(to right, var(--primary) ${progress}%, transparent ${progress}%)`,
        }}
        onChange={(event) => {
          const audio = audioRef.current;
          if (!audio) return;
          audio.currentTime = Number(event.target.value);
          setCurrent(audio.currentTime);
        }}
      />
      <span className="w-20 shrink-0 text-end text-[11px] tabular-nums text-muted-foreground">
        {formatStudioDuration(current) ?? "۰:۰۰"} / {formatStudioDuration(duration) ?? "–"}
      </span>
    </div>
  );
}
