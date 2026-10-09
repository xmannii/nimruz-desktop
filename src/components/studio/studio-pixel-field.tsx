"use client";

import { cn } from "@/lib/utils";
import { useEffect, useRef } from "react";

/** Stable per-cell phase so the field looks organic, not striped. */
function hash(x: number, y: number) {
  const value = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return value - Math.floor(value);
}

/**
 * A field of small pixels that ripple with a slow diagonal wave, used while
 * an image or video is being generated. Pauses off-screen and when the
 * window is hidden, and holds a still frame for reduced-motion users.
 */
export function StudioPixelField({
  className,
  cell = 7,
  gap = 2,
}: {
  className?: string;
  cell?: number;
  gap?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let frame = 0;
    let visible = true;
    let width = 0;
    let height = 0;
    let color = "0 0 0";
    const start = performance.now();

    const probe = document.createElement("canvas").getContext("2d", { willReadFrequently: true });

    function readColor() {
      // The theme uses oklch, so paint one pixel to get plain RGB back.
      if (!probe) return;
      probe.clearRect(0, 0, 1, 1);
      probe.fillStyle = getComputedStyle(canvas!).color;
      probe.fillRect(0, 0, 1, 1);
      const [r, g, b] = probe.getImageData(0, 0, 1, 1).data;
      color = `${r} ${g} ${b}`;
    }

    function resize() {
      const rect = canvas!.getBoundingClientRect();
      const ratio = window.devicePixelRatio || 1;
      width = rect.width;
      height = rect.height;
      canvas!.width = Math.max(1, Math.round(width * ratio));
      canvas!.height = Math.max(1, Math.round(height * ratio));
      context!.setTransform(ratio, 0, 0, ratio, 0, 0);
      readColor();
    }

    function draw(now: number) {
      const t = (now - start) / 1000;
      const step = cell + gap;
      const columns = Math.ceil(width / step);
      const rows = Math.ceil(height / step);
      const span = columns + rows;
      context!.clearRect(0, 0, width, height);
      for (let y = 0; y < rows; y += 1) {
        for (let x = 0; x < columns; x += 1) {
          const seed = hash(x, y);
          // A soft band sweeping diagonally, plus per-cell twinkle.
          const band = Math.sin(((x + y) / span) * Math.PI * 2 - t * 1.6);
          const twinkle = Math.sin(t * (1.2 + seed * 2.4) + seed * 12);
          const intensity = Math.max(0, band * 0.55 + twinkle * 0.3 + 0.2);
          const alpha = 0.05 + intensity * 0.22;
          context!.fillStyle = `rgb(${color} / ${alpha.toFixed(3)})`;
          context!.fillRect(x * step + gap / 2, y * step + gap / 2, cell, cell);
        }
      }
    }

    function loop(now: number) {
      if (visible && document.visibilityState === "visible") draw(now);
      frame = requestAnimationFrame(loop);
    }

    resize();
    draw(start + 400);
    // Always repaint after a resize: the first measure can run before layout,
    // and the loop below skips frames while the window is hidden.
    const resizeObserver = new ResizeObserver(() => {
      resize();
      draw(reduceMotion ? start + 400 : performance.now());
    });
    resizeObserver.observe(canvas);
    const visibility = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
    });
    visibility.observe(canvas);
    if (!reduceMotion) frame = requestAnimationFrame(loop);

    const themeObserver = new MutationObserver(readColor);
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "data-theme", "style"] });

    return () => {
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      visibility.disconnect();
      themeObserver.disconnect();
    };
  }, [cell, gap]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className={cn("pointer-events-none size-full text-foreground", className)}
    />
  );
}
