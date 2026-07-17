"use client";

import { MessageResponse } from "@/components/ai-elements/message";
import { Button } from "@/components/ui/button";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import {
  classifyFile,
  codeLanguageFor,
  type FileCategory,
} from "@/lib/workspace";
import {
  ExternalLinkIcon,
  FileWarningIcon,
  WrapTextIcon,
  ZoomInIcon,
  ZoomOutIcon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type FilePreviewProps = {
  workspaceId: string;
  path: string;
  className?: string;
};

type TextState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; content: string; truncated: boolean };

type BinaryState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; dataUrl: string; sizeBytes: number };

function baseName(path: string): string {
  return path.split(/[/\\]/).filter(Boolean).at(-1) ?? path;
}

/**
 * Format-aware file preview shared by the Files and Artifacts panels. Routes on
 * extension to Markdown, code, CSV/TSV, JSON, image, plain text, or an explicit
 * unsupported/binary state with an "open externally" affordance.
 */
export function FilePreview({ workspaceId, path, className }: FilePreviewProps) {
  const category = useMemo<FileCategory>(() => classifyFile(path), [path]);

  async function openExternally() {
    try {
      await window.desktop.storage.revealWorkspacePath(workspaceId, path);
    } catch {
      // ignore
    }
  }

  if (category === "image") {
    return (
      <ImagePreview
        workspaceId={workspaceId}
        path={path}
        className={className}
        onOpenExternally={openExternally}
      />
    );
  }

  if (category === "binary") {
    return (
      <UnsupportedPreview
        className={className}
        onOpenExternally={openExternally}
      />
    );
  }

  return (
    <TextualPreview
      workspaceId={workspaceId}
      path={path}
      category={category}
      className={className}
      onOpenExternally={openExternally}
    />
  );
}

function ImagePreview({
  workspaceId,
  path,
  className,
  onOpenExternally,
}: FilePreviewProps & { onOpenExternally: () => void }) {
  const [state, setState] = useState<BinaryState>({ status: "loading" });
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    setZoom(1);
    window.desktop.storage
      .readWorkspaceFileBinary(workspaceId, path)
      .then((result) => {
        if (cancelled) return;
        setState({
          status: "ready",
          dataUrl: `data:${result.mimeType};base64,${result.base64}`,
          sizeBytes: result.sizeBytes,
        });
      })
      .catch((error) => {
        if (cancelled) return;
        setState({
          status: "error",
          message:
            error instanceof Error ? error.message : "خواندن تصویر ناموفق بود.",
        });
      });
    return () => {
      cancelled = true;
    };
  }, [workspaceId, path]);

  if (state.status === "loading") {
    return <CenteredSpinner className={className} />;
  }
  if (state.status === "error") {
    return <ErrorBox className={className} message={state.message} />;
  }

  return (
    <div
      className={cn(
        "flex min-h-0 flex-col overflow-hidden rounded-lg border border-border/50 bg-muted/20",
        className
      )}
    >
      <div className="flex items-center gap-1 border-b border-border/50 p-1.5">
        <Button
          size="icon-xs"
          variant="ghost"
          title="بزرگ‌نمایی"
          onClick={() => setZoom((z) => Math.min(4, z + 0.25))}
        >
          <ZoomInIcon />
        </Button>
        <Button
          size="icon-xs"
          variant="ghost"
          title="کوچک‌نمایی"
          onClick={() => setZoom((z) => Math.max(0.25, z - 0.25))}
        >
          <ZoomOutIcon />
        </Button>
        <span className="text-[11px] text-muted-foreground">
          {Math.round(zoom * 100)}%
        </span>
        <div className="flex-1" />
        <Button
          size="icon-xs"
          variant="ghost"
          title="باز کردن در سیستم"
          onClick={onOpenExternally}
        >
          <ExternalLinkIcon />
        </Button>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="flex items-center justify-center p-3">
          <img
            src={state.dataUrl}
            alt={baseName(path)}
            style={{ width: `${zoom * 100}%` }}
            className="h-auto max-w-none rounded"
          />
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </div>
  );
}

function TextualPreview({
  workspaceId,
  path,
  category,
  className,
  onOpenExternally,
}: FilePreviewProps & {
  category: FileCategory;
  onOpenExternally: () => void;
}) {
  const [state, setState] = useState<TextState>({ status: "loading" });
  const [wrap, setWrap] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    window.desktop.storage
      .readWorkspaceFile(workspaceId, path)
      .then((result) => {
        if (cancelled) return;
        setState({
          status: "ready",
          content: result.content,
          truncated: result.truncated,
        });
      })
      .catch((error) => {
        if (cancelled) return;
        setState({
          status: "error",
          message:
            error instanceof Error ? error.message : "خواندن فایل ناموفق بود.",
        });
      });
    return () => {
      cancelled = true;
    };
  }, [workspaceId, path]);

  if (state.status === "loading") {
    return <CenteredSpinner className={className} />;
  }
  if (state.status === "error") {
    return (
      <ErrorBox
        className={className}
        message={state.message}
        onOpenExternally={onOpenExternally}
      />
    );
  }

  const showLineNumbers = category === "text" || category === "csv";

  return (
    <div
      className={cn(
        "flex min-h-0 flex-col overflow-hidden rounded-lg border border-border/50 bg-muted/20",
        className
      )}
    >
      {category === "text" ? (
        <div className="flex items-center gap-1 border-b border-border/50 p-1.5">
          <Button
            size="icon-xs"
            variant={wrap ? "secondary" : "ghost"}
            title="شکستن خط"
            onClick={() => setWrap((w) => !w)}
          >
            <WrapTextIcon />
          </Button>
          <div className="flex-1" />
          <Button
            size="icon-xs"
            variant="ghost"
            title="باز کردن در سیستم"
            onClick={onOpenExternally}
          >
            <ExternalLinkIcon />
          </Button>
        </div>
      ) : null}

      <ScrollArea className="min-h-0 flex-1">
        <TextualBody
          category={category}
          content={state.content}
          languageHint={codeLanguageFor(path)}
          csvDelimiter={path.toLowerCase().endsWith(".tsv") ? "\t" : ","}
          wrap={wrap}
          showLineNumbers={showLineNumbers}
        />
        <ScrollBar orientation="horizontal" />
      </ScrollArea>

      {state.truncated ? (
        <p className="border-t border-border/50 px-3 py-2 text-xs text-muted-foreground">
          محتوا کوتاه‌شده نمایش داده شده است.
        </p>
      ) : null}
    </div>
  );
}

/**
 * Renders already-loaded textual content (e.g. an artifact body) with the same
 * format-aware routing used for file previews.
 */
export function InlineContentPreview({
  content,
  category,
  languageHint,
  className,
}: {
  content: string;
  category: FileCategory;
  languageHint?: string | null;
  className?: string;
}) {
  return (
    <ScrollArea
      className={cn(
        "rounded-lg border border-border/50 bg-muted/20",
        className
      )}
    >
      <TextualBody
        category={category}
        content={content}
        languageHint={languageHint ?? null}
        csvDelimiter=","
        wrap
        showLineNumbers={category === "text"}
      />
      <ScrollBar orientation="horizontal" />
    </ScrollArea>
  );
}

function TextualBody({
  category,
  content,
  languageHint,
  csvDelimiter,
  wrap,
  showLineNumbers,
}: {
  category: FileCategory;
  content: string;
  languageHint: string | null;
  csvDelimiter: string;
  wrap: boolean;
  showLineNumbers: boolean;
}) {
  if (category === "markdown") {
    return (
      <div dir="rtl" className="p-3 text-sm">
        <MessageResponse>{content}</MessageResponse>
      </div>
    );
  }
  if (category === "csv") {
    return <CsvTable content={content} delimiter={csvDelimiter} />;
  }
  if (category === "json") {
    return (
      <div dir="ltr" className="p-2 text-left">
        <MessageResponse>{`\`\`\`json\n${content}\n\`\`\``}</MessageResponse>
      </div>
    );
  }
  if (category === "code") {
    return (
      <div dir="ltr" className="p-2 text-left">
        <MessageResponse>
          {`\`\`\`${languageHint ?? ""}\n${content}\n\`\`\``}
        </MessageResponse>
      </div>
    );
  }
  return (
    <PlainText content={content} wrap={wrap} showLineNumbers={showLineNumbers} />
  );
}

function PlainText({
  content,
  wrap,
  showLineNumbers,
}: {
  content: string;
  wrap: boolean;
  showLineNumbers: boolean;
}) {
  if (!content) {
    return (
      <p className="p-3 text-xs text-muted-foreground">(فایل خالی است)</p>
    );
  }
  const lines = content.split("\n");
  return (
    <div dir="ltr" className="flex text-left font-mono text-xs leading-5">
      {showLineNumbers ? (
        <pre className="select-none border-e border-border/40 px-2 py-3 text-right text-muted-foreground">
          {lines.map((_, index) => `${index + 1}\n`).join("")}
        </pre>
      ) : null}
      <pre
        className={cn(
          "flex-1 py-3 pe-3 ps-2 text-foreground",
          wrap ? "whitespace-pre-wrap break-words" : "whitespace-pre"
        )}
      >
        {content}
      </pre>
    </div>
  );
}

function CsvTable({
  content,
  delimiter,
}: {
  content: string;
  delimiter: string;
}) {
  const MAX_ROWS = 500;
  const rows = useMemo(() => {
    const parsed = content
      .split(/\r?\n/)
      .filter((line) => line.length > 0)
      .slice(0, MAX_ROWS)
      .map((line) => line.split(delimiter));
    return parsed;
  }, [content, delimiter]);

  if (rows.length === 0) {
    return <p className="p-3 text-xs text-muted-foreground">(فایل خالی است)</p>;
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

function UnsupportedPreview({
  className,
  onOpenExternally,
}: {
  className?: string;
  onOpenExternally: () => void;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-lg border border-border/50 bg-muted/20 p-6 text-center",
        className
      )}
    >
      <FileWarningIcon className="size-6 text-muted-foreground" />
      <p className="text-sm text-muted-foreground">
        پیش‌نمایش این نوع فایل پشتیبانی نمی‌شود.
      </p>
      <Button variant="outline" size="sm" onClick={onOpenExternally}>
        <ExternalLinkIcon />
        باز کردن در سیستم
      </Button>
    </div>
  );
}

function CenteredSpinner({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center justify-center", className)}>
      <Spinner />
    </div>
  );
}

function ErrorBox({
  className,
  message,
  onOpenExternally,
}: {
  className?: string;
  message: string;
  onOpenExternally?: () => void;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-center text-xs text-destructive",
        className
      )}
    >
      <span>{message}</span>
      {onOpenExternally ? (
        <Button variant="outline" size="sm" onClick={onOpenExternally}>
          <ExternalLinkIcon />
          باز کردن در سیستم
        </Button>
      ) : null}
    </div>
  );
}
