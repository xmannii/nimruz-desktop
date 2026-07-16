"use client";

import { MessageResponse } from "@/components/ai-elements/message";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { ArtifactKind, ArtifactRecord } from "@/lib/workspace";
import { useMemo } from "react";

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
  html, body { margin: 0; padding: 16px; font-family: system-ui, sans-serif; }
</style>
</head>
<body>
${content}
</body>
</html>`;
}

function wrapSvgDocument(content: string): string {
  const trimmed = content.trim();
  if (/^<!DOCTYPE/i.test(trimmed) || /<html[\s>]/i.test(trimmed)) {
    return content;
  }
  const svg = /<svg[\s>]/i.test(trimmed)
    ? trimmed
    : `<svg xmlns="http://www.w3.org/2000/svg">${trimmed}</svg>`;
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<style>
  html, body { margin: 0; height: 100%; display: flex; align-items: center; justify-content: center; background: transparent; }
  svg { max-width: 100%; height: auto; }
</style>
</head>
<body>${svg}</body>
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
    return <p className="p-3 text-xs text-muted-foreground">(خالی)</p>;
  }

  const [header, ...body] = rows;
  return (
    <div dir="ltr" className="p-2 text-left">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr>
            {header.map((cell, index) => (
              <th
                key={index}
                className="sticky top-0 border border-border/50 bg-muted/60 px-2 py-1 text-left font-medium"
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
                  className="border border-border/40 px-2 py-1 align-top"
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
      className={cn("h-full min-h-0 w-full flex-1 border-0 bg-white", className)}
    />
  );
}

function PreviewBody({
  kind,
  content,
  language,
  title,
}: {
  kind: ReturnType<typeof normalizeArtifactKind>;
  content: string;
  language: string | null;
  title: string;
}) {
  if (kind === "html") {
    return (
      <SandboxedFrame srcDoc={wrapHtmlDocument(content)} title={title} />
    );
  }
  if (kind === "svg") {
    return (
      <SandboxedFrame srcDoc={wrapSvgDocument(content)} title={title} />
    );
  }
  if (kind === "mermaid") {
    const fenced = content.trim().startsWith("```")
      ? content
      : `\`\`\`mermaid\n${content.trim()}\n\`\`\``;
    return (
      <ScrollArea className="h-full min-h-0">
        <div dir="ltr" className="p-3 text-left">
          <MessageResponse>{fenced}</MessageResponse>
        </div>
      </ScrollArea>
    );
  }
  if (kind === "markdown") {
    return (
      <ScrollArea className="h-full min-h-0">
        <div dir="rtl" className="p-3 text-sm">
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
        <div dir="ltr" className="p-2 text-left">
          <MessageResponse>{`\`\`\`json\n${content}\n\`\`\``}</MessageResponse>
        </div>
      </ScrollArea>
    );
  }
  // code
  return (
    <ScrollArea className="h-full min-h-0">
      <div dir="ltr" className="p-2 text-left">
        <MessageResponse>
          {`\`\`\`${language ?? ""}\n${content}\n\`\`\``}
        </MessageResponse>
      </div>
    </ScrollArea>
  );
}

function RawSource({ content }: { content: string }) {
  return (
    <ScrollArea className="h-full min-h-0">
      <pre
        dir="ltr"
        className="whitespace-pre-wrap break-words p-3 text-left font-mono text-xs leading-5 text-foreground"
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
};

/**
 * Claude-style artifact viewer: Preview renders the deliverable; Code shows raw source.
 */
export function ArtifactPreview({
  artifact,
  content,
  className,
  initialTab,
}: ArtifactPreviewProps) {
  const kind = normalizeArtifactKind(artifact.kind);
  const language = languageFromArtifact(artifact);
  const defaultTab =
    initialTab ?? (kind === "code" ? "code" : "preview");

  return (
    <Tabs
      key={`${artifact.id}:${defaultTab}`}
      defaultValue={defaultTab}
      className={cn("flex min-h-0 flex-1 flex-col gap-2", className)}
    >
      <TabsList variant="line" className="w-full shrink-0">
        <TabsTrigger value="preview">پیش‌نمایش</TabsTrigger>
        <TabsTrigger value="code">کد</TabsTrigger>
      </TabsList>
      <TabsContent
        value="preview"
        className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border/50 bg-muted/20"
      >
        <PreviewBody
          kind={kind}
          content={content}
          language={language}
          title={artifact.title}
        />
      </TabsContent>
      <TabsContent
        value="code"
        className="min-h-0 flex-1 overflow-hidden rounded-lg border border-border/50 bg-muted/20"
      >
        <RawSource content={content} />
      </TabsContent>
    </Tabs>
  );
}
