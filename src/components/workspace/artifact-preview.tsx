"use client";

import { MessageResponse } from "@/components/ai-elements/message";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import type { ArtifactKind, ArtifactRecord } from "@/lib/workspace";
import { mermaid as mermaidPlugin } from "@streamdown/mermaid";
import {
  CheckIcon,
  CodeIcon,
  CopyIcon,
  DownloadIcon,
  EyeIcon,
  Maximize2Icon,
  Minimize2Icon,
  ZoomInIcon,
  ZoomOutIcon,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { toast } from "sonner";

/** Map stored kinds (including legacy) to a renderable preview kind. */
export function normalizeArtifactKind(
  kind: ArtifactKind
): "html" | "markdown" | "svg" | "mermaid" | "code" | "data" {
  switch (kind) {
    case "html":
    case "svg":
    case "mermaid":
    case "code":
    case "data":
    case "markdown":
      return kind;
    case "document":
      return "markdown";
    case "image":
      return "svg";
    default:
      return "markdown";
  }
}

export function languageFromArtifact(artifact: ArtifactRecord): string | null {
  const mime = artifact.mimeType ?? "";
  const langMatch = mime.match(/text\/x-([a-z0-9_+-]+)/i);
  if (langMatch?.[1]) return langMatch[1];
  if (mime.includes("typescript")) return "ts";
  if (mime.includes("javascript")) return "js";
  if (mime.includes("python")) return "python";
  return null;
}

function sanitizeFilename(title: string): string {
  const trimmed = title.trim().replace(/\s+/g, " ").slice(0, 80);
  const safe = trimmed.replace(/[^\w\u0600-\u06FF\s.-]+/g, "").trim();
  return safe || "artifact";
}

function extensionForArtifact(
  kind: ReturnType<typeof normalizeArtifactKind>,
  language: string | null
): string {
  switch (kind) {
    case "html":
      return "html";
    case "markdown":
      return "md";
    case "svg":
      return "svg";
    case "mermaid":
      return "mmd";
    case "data":
      return "json";
    case "code":
      return language?.replace(/^\./, "") || "txt";
    default:
      return "txt";
  }
}

function mimeForArtifact(
  kind: ReturnType<typeof normalizeArtifactKind>,
  mimeType: string
): string {
  if (mimeType?.trim()) return mimeType;
  switch (kind) {
    case "html":
      return "text/html;charset=utf-8";
    case "markdown":
      return "text/markdown;charset=utf-8";
    case "svg":
      return "image/svg+xml;charset=utf-8";
    case "mermaid":
      return "text/plain;charset=utf-8";
    case "data":
      return "application/json;charset=utf-8";
    default:
      return "text/plain;charset=utf-8";
  }
}

function downloadTextFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function wrapHtmlDocument(content: string): string {
  const trimmed = content.trim();
  if (/^<!DOCTYPE/i.test(trimmed) || /<html[\s>]/i.test(trimmed)) {
    return content;
  }
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>
  html, body { margin: 0; padding: 16px; font-family: system-ui, sans-serif; box-sizing: border-box; }
  *, *::before, *::after { box-sizing: inherit; }
</style>
</head>
<body>
${content}
</body>
</html>`;
}

function looksLikeCsv(content: string): boolean {
  const trimmed = content.trimStart();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) return false;
  const firstLine = content.split(/\r?\n/, 1)[0] ?? "";
  return firstLine.includes(",") || firstLine.includes("\t");
}

function CsvTable({ content }: { content: string }) {
  const delimiter = content.includes("\t") ? "\t" : ",";
  const rows = useMemo(() => {
    return content
      .split(/\r?\n/)
      .filter((line) => line.length > 0)
      .slice(0, 500)
      .map((line) => line.split(delimiter));
  }, [content, delimiter]);

  if (rows.length === 0) {
    return <p className="p-4 text-xs text-muted-foreground">(خالی)</p>;
  }

  const [header, ...body] = rows;
  return (
    <div dir="ltr" className="p-3 text-left">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr>
            {header.map((cell, index) => (
              <th
                key={index}
                className="sticky top-0 border border-border/50 bg-muted/80 px-2 py-1.5 text-left font-medium backdrop-blur"
              >
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {body.map((row, rowIndex) => (
            <tr key={rowIndex} className="odd:bg-muted/20">
              {row.map((cell, cellIndex) => (
                <td
                  key={cellIndex}
                  className="border border-border/40 px-2 py-1.5 align-top"
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SandboxedFrame({
  srcDoc,
  title,
  className,
}: {
  srcDoc: string;
  title: string;
  className?: string;
}) {
  return (
    <iframe
      title={title}
      sandbox="allow-scripts"
      srcDoc={srcDoc}
      className={cn(
        "block h-full min-h-0 w-full flex-1 border-0 bg-background",
        className
      )}
    />
  );
}

function stripMermaidFences(content: string): string {
  const trimmed = content.trim();
  const fenced = trimmed.match(/^```(?:mermaid)?\s*([\s\S]*?)```$/i);
  return (fenced?.[1] ?? trimmed).trim();
}

function isDarkTheme(): boolean {
  if (typeof document === "undefined") return false;
  return document.documentElement.classList.contains("dark");
}

function readSvgNaturalSize(svg: SVGSVGElement): { width: number; height: number } {
  const viewBox = svg.viewBox?.baseVal;
  if (viewBox && viewBox.width > 0 && viewBox.height > 0) {
    return { width: viewBox.width, height: viewBox.height };
  }
  const attrW = Number.parseFloat(svg.getAttribute("width") ?? "");
  const attrH = Number.parseFloat(svg.getAttribute("height") ?? "");
  if (Number.isFinite(attrW) && Number.isFinite(attrH) && attrW > 0 && attrH > 0) {
    return { width: attrW, height: attrH };
  }
  try {
    const box = svg.getBBox();
    if (box.width > 0 && box.height > 0) {
      return { width: box.width, height: box.height };
    }
  } catch {
    // ignore
  }
  const rect = svg.getBoundingClientRect();
  return {
    width: Math.max(rect.width, 1),
    height: Math.max(rect.height, 1),
  };
}

type PanZoom = { x: number; y: number; scale: number };

const MIN_SCALE = 0.2;
const MAX_SCALE = 8;
/** Start a bit closer than pure fit so diagrams feel readable. */
const INITIAL_ZOOM_IN = 1.25;

function clampScale(scale: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

/**
 * Interactive pan/zoom surface for diagram SVGs.
 * Wheel = zoom toward cursor, drag = pan, double-click = refit.
 */
function DiagramPanZoom({
  svgHtml,
  className,
  onToggleExpand,
  expanded = false,
}: {
  svgHtml: string;
  className?: string;
  onToggleExpand?: () => void;
  expanded?: boolean;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [panZoom, setPanZoom] = useState<PanZoom>({ x: 0, y: 0, scale: 1 });
  const panZoomRef = useRef(panZoom);
  panZoomRef.current = panZoom;
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const fitToView = useCallback((zoomIn = INITIAL_ZOOM_IN) => {
    const viewport = viewportRef.current;
    const content = contentRef.current;
    if (!viewport || !content) return;
    const svg = content.querySelector("svg");
    if (!svg) return;

    const pad = 16;
    const availW = Math.max(viewport.clientWidth - pad * 2, 1);
    const availH = Math.max(viewport.clientHeight - pad * 2, 1);
    const natural = readSvgNaturalSize(svg);
    const fit = Math.min(availW / natural.width, availH / natural.height);
    const scale = clampScale(fit * zoomIn);
    const x = (viewport.clientWidth - natural.width * scale) / 2;
    const y = (viewport.clientHeight - natural.height * scale) / 2;
    setPanZoom({ x, y, scale });
  }, []);

  useLayoutEffect(() => {
    const content = contentRef.current;
    if (!content) return;
    const svg = content.querySelector("svg");
    if (!svg) return;

    // Keep intrinsic geometry for measuring; pan/zoom handles display size.
    svg.style.width = `${readSvgNaturalSize(svg).width}px`;
    svg.style.height = `${readSvgNaturalSize(svg).height}px`;
    svg.style.maxWidth = "none";
    svg.style.maxHeight = "none";
    svg.style.display = "block";
    svg.removeAttribute("preserveAspectRatio");

    fitToView(INITIAL_ZOOM_IN);
    // Dialog/layout may settle after first paint — refit once more.
    const timer = window.setTimeout(() => fitToView(INITIAL_ZOOM_IN), 60);
    return () => window.clearTimeout(timer);
  }, [svgHtml, fitToView]);

  const zoomAt = useCallback((nextScale: number, clientX: number, clientY: number) => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const rect = viewport.getBoundingClientRect();
    const current = panZoomRef.current;
    const scale = clampScale(nextScale);
    const localX = clientX - rect.left;
    const localY = clientY - rect.top;
    // Keep the point under the cursor stable while zooming.
    const x = localX - ((localX - current.x) / current.scale) * scale;
    const y = localY - ((localY - current.y) / current.scale) * scale;
    setPanZoom({ x, y, scale });
  }, []);

  const zoomBy = useCallback(
    (factor: number) => {
      const viewport = viewportRef.current;
      if (!viewport) return;
      const rect = viewport.getBoundingClientRect();
      zoomAt(
        panZoomRef.current.scale * factor,
        rect.left + rect.width / 2,
        rect.top + rect.height / 2
      );
    },
    [zoomAt]
  );

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const factor = event.deltaY < 0 ? 1.12 : 1 / 1.12;
      zoomAt(panZoomRef.current.scale * factor, event.clientX, event.clientY);
    };

    viewport.addEventListener("wheel", onWheel, { passive: false });
    return () => viewport.removeEventListener("wheel", onWheel);
  }, [zoomAt, svgHtml]);

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: panZoomRef.current.x,
      originY: panZoomRef.current.y,
    };
    setIsDragging(true);
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    setPanZoom({
      x: drag.originX + (event.clientX - drag.startX),
      y: drag.originY + (event.clientY - drag.startY),
      scale: panZoomRef.current.scale,
    });
  }

  function endDrag(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setIsDragging(false);
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // ignore
    }
  }

  const zoomPercent = Math.round(panZoom.scale * 100);

  return (
    <div className={cn("relative h-full min-h-0 w-full flex-1", className)}>
      <div
        ref={viewportRef}
        dir="ltr"
        className={cn(
          "h-full min-h-0 w-full touch-none overflow-hidden bg-background",
          isDragging ? "cursor-grabbing" : "cursor-grab"
        )}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onDoubleClick={() => fitToView(INITIAL_ZOOM_IN)}
      >
        <div
          ref={contentRef}
          className="origin-top-left will-change-transform select-none"
          style={{
            transform: `translate(${panZoom.x}px, ${panZoom.y}px) scale(${panZoom.scale})`,
          }}
          dangerouslySetInnerHTML={{ __html: svgHtml }}
        />
      </div>

      <div
        dir="ltr"
        className="pointer-events-none absolute inset-x-0 bottom-2 flex justify-center"
      >
        <div className="pointer-events-auto flex items-center gap-0.5 rounded-xl border border-border/60 bg-background/90 p-0.5 shadow-sm backdrop-blur">
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            className="size-7"
            title="کوچک‌نمایی"
            aria-label="کوچک‌نمایی"
            onClick={() => zoomBy(1 / 1.2)}
          >
            <ZoomOutIcon className="size-3.5" />
          </Button>
          <button
            type="button"
            className="min-w-12 px-1 text-center font-mono text-[11px] text-muted-foreground tabular-nums"
            title="بازنشانی نما"
            onClick={() => fitToView(INITIAL_ZOOM_IN)}
          >
            {zoomPercent}%
          </button>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            className="size-7"
            title="بزرگ‌نمایی"
            aria-label="بزرگ‌نمایی"
            onClick={() => zoomBy(1.2)}
          >
            <ZoomInIcon className="size-3.5" />
          </Button>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            className="size-7"
            title={expanded ? "خروج از تمام‌صفحه" : "تمام‌صفحه"}
            aria-label={expanded ? "خروج از تمام‌صفحه" : "تمام‌صفحه"}
            onClick={() => {
              if (onToggleExpand) onToggleExpand();
              else fitToView(INITIAL_ZOOM_IN);
            }}
          >
            {expanded ? (
              <Minimize2Icon className="size-3.5" />
            ) : (
              <Maximize2Icon className="size-3.5" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * Renders Mermaid into an interactive pan/zoom canvas.
 */
function MermaidCanvas({
  source,
  onToggleExpand,
  expanded,
}: {
  source: string;
  onToggleExpand?: () => void;
  expanded?: boolean;
}) {
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const renderIdRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    const id = `artifact-mermaid-${++renderIdRef.current}`;
    const code = stripMermaidFences(source);

    async function render() {
      setError(null);
      setSvg(null);
      try {
        const api = mermaidPlugin.getMermaid({
          startOnLoad: false,
          securityLevel: "strict",
          theme: isDarkTheme() ? "dark" : "default",
          fontFamily: "ui-sans-serif, system-ui, sans-serif",
          flowchart: {
            useMaxWidth: false,
            htmlLabels: true,
            curve: "basis",
          },
          sequence: { useMaxWidth: false },
          gantt: { useMaxWidth: false },
          journey: { useMaxWidth: false },
          timeline: { useMaxWidth: false },
          class: { useMaxWidth: false },
          state: { useMaxWidth: false },
          er: { useMaxWidth: false },
          pie: { useMaxWidth: false },
        });
        const result = await api.render(id, code);
        if (cancelled) return;
        setSvg(result.svg);
      } catch (err) {
        if (cancelled) return;
        setError(
          err instanceof Error ? err.message : "رندر نمودار ناموفق بود."
        );
      }
    }

    void render();
    return () => {
      cancelled = true;
    };
  }, [source]);

  if (error) {
    return (
      <div className="flex h-full items-center justify-center p-4 text-center text-sm text-destructive">
        {error}
      </div>
    );
  }

  if (!svg) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner />
      </div>
    );
  }

  return (
    <DiagramPanZoom
      key={svg.slice(0, 64)}
      svgHtml={svg}
      onToggleExpand={onToggleExpand}
      expanded={expanded}
    />
  );
}

function PreviewBody({
  kind,
  content,
  language,
  title,
  onToggleExpand,
  expanded,
}: {
  kind: ReturnType<typeof normalizeArtifactKind>;
  content: string;
  language: string | null;
  title: string;
  onToggleExpand?: () => void;
  expanded?: boolean;
}) {
  if (kind === "html") {
    return (
      <SandboxedFrame srcDoc={wrapHtmlDocument(content)} title={title} />
    );
  }
  if (kind === "svg") {
    const trimmed = content.trim();
    const svg = /<svg[\s>]/i.test(trimmed)
      ? trimmed
      : `<svg xmlns="http://www.w3.org/2000/svg">${trimmed}</svg>`;
    return (
      <DiagramPanZoom
        key={svg.slice(0, 64)}
        svgHtml={svg}
        onToggleExpand={onToggleExpand}
        expanded={expanded}
      />
    );
  }
  if (kind === "mermaid") {
    return (
      <MermaidCanvas
        source={content}
        onToggleExpand={onToggleExpand}
        expanded={expanded}
      />
    );
  }
  if (kind === "markdown") {
    return (
      <ScrollArea className="h-full min-h-0">
        <div
          dir="rtl"
          className={cn(
            "px-4 py-4 text-sm leading-7",
            "[&_.streamdown]:max-w-none",
            "[&_h1]:text-xl [&_h1]:font-semibold [&_h1]:tracking-tight",
            "[&_h2]:text-lg [&_h2]:font-semibold",
            "[&_pre]:overflow-x-auto [&_pre]:rounded-lg",
            "[&_img]:max-w-full [&_img]:rounded-lg",
            "[&_table]:w-full"
          )}
        >
          <MessageResponse>{content}</MessageResponse>
        </div>
      </ScrollArea>
    );
  }
  if (kind === "data") {
    if (looksLikeCsv(content)) {
      return (
        <ScrollArea className="h-full min-h-0">
          <CsvTable content={content} />
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      );
    }
    return (
      <ScrollArea className="h-full min-h-0">
        <div dir="ltr" className="p-3 text-left">
          <MessageResponse>{`\`\`\`json\n${content}\n\`\`\``}</MessageResponse>
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    );
  }
  return (
    <ScrollArea className="h-full min-h-0">
      <div dir="ltr" className="p-3 text-left">
        <MessageResponse>
          {`\`\`\`${language ?? ""}\n${content}\n\`\`\``}
        </MessageResponse>
      </div>
      <ScrollBar orientation="horizontal" />
    </ScrollArea>
  );
}

function RawSource({ content }: { content: string }) {
  return (
    <ScrollArea className="h-full min-h-0">
      <pre
        dir="ltr"
        className="min-h-full whitespace-pre-wrap break-words bg-muted/20 p-4 text-left font-mono text-xs leading-5 text-foreground"
      >
        {content || "(خالی)"}
      </pre>
      <ScrollBar orientation="horizontal" />
    </ScrollArea>
  );
}

type ArtifactPreviewProps = {
  artifact: ArtifactRecord;
  content: string;
  className?: string;
  /** Force initial tab (e.g. auto-reveal always opens preview). */
  initialTab?: "preview" | "code";
  /** Optional extra actions rendered in the slim toolbar (e.g. delete). */
  toolbarEnd?: ReactNode;
};

/**
 * Full-bleed artifact viewer: preview uses the panel canvas; source is one click away.
 * Maximize opens a near-fullscreen in-app dialog for diagrams and other previews.
 */
export function ArtifactPreview({
  artifact,
  content,
  className,
  initialTab,
  toolbarEnd,
}: ArtifactPreviewProps) {
  const kind = normalizeArtifactKind(artifact.kind);
  const language = languageFromArtifact(artifact);
  const [tab, setTab] = useState<"preview" | "code">(
    () => initialTab ?? (kind === "code" ? "code" : "preview")
  );
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const toggleExpand = useCallback(() => {
    setExpanded((value) => !value);
  }, []);

  const handleCopy = useCallback(async () => {
    if (!content.trim()) {
      toast.error("محتوایی برای کپی وجود ندارد.");
      return;
    }
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      toast.success("محتوا کپی شد.");
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("کپی ناموفق بود.");
    }
  }, [content]);

  const handleDownload = useCallback(() => {
    if (!content.trim()) {
      toast.error("محتوایی برای دانلود وجود ندارد.");
      return;
    }
    const ext = extensionForArtifact(kind, language);
    const filename = `${sanitizeFilename(artifact.title)}.${ext}`;
    downloadTextFile(
      content,
      filename,
      mimeForArtifact(kind, artifact.mimeType)
    );
    toast.success("دانلود شروع شد.");
  }, [artifact.mimeType, artifact.title, content, kind, language]);

  const actionButtons = (
    <>
      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        className="size-7"
        title="کپی محتوا"
        aria-label="کپی محتوا"
        onClick={() => void handleCopy()}
      >
        {copied ? (
          <CheckIcon className="size-3.5" />
        ) : (
          <CopyIcon className="size-3.5" />
        )}
      </Button>
      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        className="size-7"
        title="دانلود"
        aria-label="دانلود"
        onClick={handleDownload}
      >
        <DownloadIcon className="size-3.5" />
      </Button>
    </>
  );

  const viewer = (opts: { expandedMode: boolean; surfaceKey: string }) =>
    tab === "preview" ? (
      <PreviewBody
        key={opts.surfaceKey}
        kind={kind}
        content={content}
        language={language}
        title={artifact.title}
        onToggleExpand={toggleExpand}
        expanded={opts.expandedMode}
      />
    ) : (
      <RawSource content={content} />
    );

  return (
    <>
      <div className={cn("flex min-h-0 flex-1 flex-col", className)}>
        <div className="flex shrink-0 items-center gap-1 border-b border-sidebar-border/80 px-2 py-1.5">
          <div className="flex items-center rounded-lg bg-muted/70 p-0.5 dark:bg-muted/40">
            <Button
              type="button"
              size="sm"
              variant={tab === "preview" ? "secondary" : "ghost"}
              className="h-7 gap-1.5 rounded-md px-2.5 text-xs"
              onClick={() => setTab("preview")}
            >
              <EyeIcon className="size-3.5" />
              پیش‌نمایش
            </Button>
            <Button
              type="button"
              size="sm"
              variant={tab === "code" ? "secondary" : "ghost"}
              className="h-7 gap-1.5 rounded-md px-2.5 text-xs"
              onClick={() => setTab("code")}
            >
              <CodeIcon className="size-3.5" />
              منبع
            </Button>
          </div>
          <div className="ms-auto flex items-center gap-1">
            {actionButtons}
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              className="size-7"
              title="تمام‌صفحه"
              aria-label="تمام‌صفحه"
              onClick={() => setExpanded(true)}
            >
              <Maximize2Icon className="size-3.5" />
            </Button>
            {toolbarEnd}
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
          {viewer({ expandedMode: false, surfaceKey: "panel" })}
        </div>
      </div>

      <Dialog open={expanded} onOpenChange={setExpanded}>
        <DialogContent
          showCloseButton
          className={cn(
            "flex flex-col gap-0 overflow-hidden p-0",
            "h-[min(96vh,100dvh-1rem)] w-[min(96vw,100dvw-1rem)] max-w-none",
            "rounded-2xl sm:max-w-none"
          )}
        >
          <DialogHeader className="flex shrink-0 flex-row items-center gap-2 space-y-0 border-b border-border/60 px-4 py-3 pe-12 text-start">
            <DialogTitle className="min-w-0 flex-1 truncate text-sm">
              {artifact.title}
            </DialogTitle>
            <div className="flex shrink-0 items-center gap-1">
              {actionButtons}
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                className="size-7"
                title="خروج از تمام‌صفحه"
                aria-label="خروج از تمام‌صفحه"
                onClick={() => setExpanded(false)}
              >
                <Minimize2Icon className="size-3.5" />
              </Button>
            </div>
          </DialogHeader>
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
            {viewer({ expandedMode: true, surfaceKey: "fullscreen" })}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
