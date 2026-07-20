"use client";

import { MessageResponse } from "@/components/ai-elements/message";
import { Button } from "@/components/ui/button";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  classifyFile,
  codeLanguageFor,
  type FileCategory,
} from "@/lib/workspace";
import {
  ExternalLinkIcon,
  FileWarningIcon,
  SaveIcon,
  ZoomInIcon,
  ZoomOutIcon,
} from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

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

let shikiPromise: Promise<
  typeof import("@/lib/workspace/syntax-highlighter")
> | null = null;

function loadShiki() {
  shikiPromise ??= import("@/lib/workspace/syntax-highlighter");
  return shikiPromise;
}

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
        "flex min-h-0 flex-col overflow-hidden bg-muted/10",
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

function editorLanguage(category: FileCategory, path: string): string | null {
  if (category === "code") return codeLanguageFor(path);
  if (category === "json") return "json";
  if (category === "markdown") return "markdown";
  return null;
}

function SyntaxEditor({
  value,
  language,
  readOnly,
  onChange,
  onSave,
}: {
  value: string;
  language: string | null;
  readOnly: boolean;
  onChange: (value: string) => void;
  onSave: () => void;
}) {
  const { resolvedTheme } = useTheme();
  const [highlightedHtml, setHighlightedHtml] = useState("");
  const backdropRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!language || value.length > 200_000) {
      setHighlightedHtml("");
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      void loadShiki()
        .then(({ highlightCode }) =>
          highlightCode(value || " ", language, resolvedTheme === "dark")
        )
        .then((html) => {
          if (!cancelled) setHighlightedHtml(html);
        })
        .catch(() => {
          if (!cancelled) setHighlightedHtml("");
        });
    }, 80);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [language, resolvedTheme, value]);

  function syncScroll(textarea: HTMLTextAreaElement) {
    if (!backdropRef.current) return;
    backdropRef.current.scrollTop = textarea.scrollTop;
    backdropRef.current.scrollLeft = textarea.scrollLeft;
  }

  useEffect(() => {
    if (textareaRef.current) syncScroll(textareaRef.current);
  }, [highlightedHtml]);

  return (
    <div dir="ltr" className="relative min-h-0 flex-1 overflow-hidden bg-background">
      {highlightedHtml ? (
        <div
          ref={backdropRef}
          aria-hidden
          className="pointer-events-none absolute inset-0 overflow-hidden text-left font-mono text-xs leading-6 [&_.shiki]:min-h-full [&_.shiki]:min-w-max [&_.shiki]:overflow-visible [&_.shiki]:!bg-transparent [&_.shiki]:p-4 [&_.shiki]:font-mono [&_.shiki]:text-xs [&_.shiki]:leading-6"
          style={{ tabSize: 2 }}
          dangerouslySetInnerHTML={{ __html: highlightedHtml }}
        />
      ) : null}
      <Textarea
        ref={textareaRef}
        value={value}
        readOnly={readOnly}
        wrap="off"
        spellCheck={false}
        aria-label="ویرایشگر فایل"
        onChange={(event) => onChange(event.currentTarget.value)}
        onScroll={(event) => syncScroll(event.currentTarget)}
        onKeyDown={(event) => {
          if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
            event.preventDefault();
            onSave();
            return;
          }
          if (event.key !== "Tab" || readOnly) return;

          event.preventDefault();
          const start = event.currentTarget.selectionStart;
          const end = event.currentTarget.selectionEnd;
          const nextValue = `${value.slice(0, start)}  ${value.slice(end)}`;
          onChange(nextValue);
          window.requestAnimationFrame(() => {
            textareaRef.current?.setSelectionRange(start + 2, start + 2);
          });
        }}
        style={{ tabSize: 2 }}
        className={cn(
          "field-sizing-fixed absolute inset-0 size-full min-h-0 resize-none overflow-auto whitespace-pre rounded-none border-0 bg-transparent p-4 font-mono text-xs leading-6 shadow-none caret-foreground focus-visible:ring-0",
          highlightedHtml
            ? "text-transparent [-webkit-text-fill-color:transparent]"
            : "text-foreground"
        )}
      />
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
  const [draft, setDraft] = useState("");
  const [isSaving, setIsSaving] = useState(false);

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
        setDraft(result.content);
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

  const readyState = state;
  const isDirty = draft !== readyState.content;

  async function save() {
    if (!isDirty || isSaving || readyState.truncated) return;
    setIsSaving(true);
    try {
      await window.desktop.storage.createWorkspaceFile(workspaceId, path, draft);
      setState({ ...readyState, content: draft });
      toast.success("فایل ذخیره شد.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "ذخیره فایل ناموفق بود.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div
      className={cn(
        "flex min-h-0 flex-col overflow-hidden bg-background",
        className
      )}
    >
      {isDirty ? (
        <div className="flex h-9 shrink-0 items-center gap-2 border-b border-border/50 px-2">
          <span className="size-1.5 rounded-full bg-primary" />
          <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
            تغییرات ذخیره‌نشده
          </span>
          <Button
            size="xs"
            onClick={() => void save()}
            disabled={isSaving || state.truncated}
          >
            {isSaving ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <SaveIcon data-icon="inline-start" />
            )}
            ذخیره
          </Button>
        </div>
      ) : null}

      <SyntaxEditor
        value={draft}
        language={editorLanguage(category, path)}
        readOnly={state.truncated}
        onChange={setDraft}
        onSave={() => void save()}
      />

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
  className,
}: {
  content: string;
  category: FileCategory;
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
  csvDelimiter,
  wrap,
  showLineNumbers,
}: {
  category: FileCategory;
  content: string;
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
  if (category === "json" || category === "code") {
    return (
      <PlainText
        content={content}
        wrap={wrap}
        showLineNumbers={showLineNumbers}
      />
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
        "flex flex-col items-center justify-center gap-3 bg-muted/10 p-6 text-center",
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
        "flex flex-col items-center justify-center gap-3 bg-destructive/10 p-4 text-center text-xs text-destructive",
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
