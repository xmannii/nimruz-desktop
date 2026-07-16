"use client";

import { ChatToolInvocation } from "@/components/chat/chat-tool-invocation";
import { Button } from "@/components/ui/button";
import { requestReveal } from "@/lib/workspace";
import {
  ExternalLinkIcon,
  FilePlus2Icon,
  FileSearchIcon,
  FileTextIcon,
  FolderIcon,
  ListTodoIcon,
  MoveIcon,
  PencilIcon,
  SearchIcon,
  TerminalIcon,
  Trash2Icon,
} from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";

type WorkspaceToolPart = {
  type: string;
  toolCallId: string;
  state: string;
  input?: Record<string, unknown>;
  output?: unknown;
  errorText?: string;
};

const TOOL_ICONS: Record<string, ReactNode> = {
  list_directory: <FolderIcon />,
  read_file: <FileTextIcon />,
  search_files: <SearchIcon />,
  write_file: <FilePlus2Icon />,
  apply_patch: <PencilIcon />,
  move_file: <MoveIcon />,
  delete_file: <Trash2Icon />,
  run_command: <TerminalIcon />,
  create_artifact: <FileSearchIcon />,
  update_task: <ListTodoIcon />,
};

const TOOL_LOADING_LABELS: Record<string, string> = {
  list_directory: "در حال فهرست‌کردن فایل‌ها…",
  read_file: "در حال خواندن فایل…",
  search_files: "در حال جستجو در فایل‌ها…",
  write_file: "در حال نوشتن فایل…",
  apply_patch: "در حال اعمال تغییر…",
  move_file: "در حال انتقال فایل…",
  delete_file: "در حال حذف فایل…",
  run_command: "در حال اجرای دستور…",
  create_artifact: "در حال ساخت آرتیفکت…",
  update_task: "در حال به‌روزرسانی تسک…",
};

const TOOL_DONE_LABELS: Record<string, string> = {
  list_directory: "فهرست فایل‌ها دریافت شد",
  read_file: "فایل خوانده شد",
  search_files: "جستجو انجام شد",
  write_file: "فایل ذخیره شد",
  apply_patch: "تغییر اعمال شد",
  move_file: "فایل منتقل شد",
  delete_file: "فایل حذف شد",
  run_command: "دستور اجرا شد",
  create_artifact: "آرتیفکت ساخته شد",
  update_task: "تسک به‌روزرسانی شد",
};

const TOOL_ERROR_LABELS: Record<string, string> = {
  list_directory: "خطا در فهرست‌کردن فایل‌ها",
  read_file: "خطا در خواندن فایل",
  search_files: "خطا در جستجو",
  write_file: "خطا در نوشتن فایل",
  apply_patch: "خطا در اعمال تغییر",
  move_file: "خطا در انتقال فایل",
  delete_file: "خطا در حذف فایل",
  run_command: "خطا در اجرای دستور",
  create_artifact: "خطا در ساخت آرتیفکت",
  update_task: "خطا در به‌روزرسانی تسک",
};

function getToolName(type: string): string {
  return type.replace(/^tool-/, "");
}

function getSubject(toolName: string, input?: Record<string, unknown>): string | null {
  if (!input) return null;
  const candidate =
    input.path ?? input.command ?? input.title ?? input.query ?? input.from;
  if (typeof candidate === "string" && candidate.trim()) {
    return candidate.trim();
  }
  return null;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} بایت`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} کیلوبایت`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} مگابایت`;
}

/** A short, tool-specific result summary rendered under the label. */
function getResultSummary(
  toolName: string,
  output: unknown
): string | null {
  if (output == null || typeof output !== "object") return null;
  const out = output as Record<string, unknown>;
  switch (toolName) {
    case "write_file":
    case "create_workspace_file":
      return typeof out.sizeBytes === "number"
        ? `حجم: ${formatBytes(out.sizeBytes)}`
        : null;
    case "read_file":
      return typeof out.sizeBytes === "number"
        ? `${formatBytes(out.sizeBytes)}${out.truncated ? " · کوتاه‌شده" : ""}`
        : null;
    case "apply_patch":
      return typeof out.replacements === "number"
        ? `${out.replacements.toLocaleString("fa-IR")} جایگزینی`
        : null;
    case "search_files": {
      const matches = Array.isArray(out.matches) ? out.matches.length : null;
      return matches !== null
        ? `${matches.toLocaleString("fa-IR")} نتیجه`
        : null;
    }
    case "list_directory": {
      const entries = Array.isArray(out.entries) ? out.entries.length : null;
      return entries !== null
        ? `${entries.toLocaleString("fa-IR")} مورد`
        : null;
    }
    case "run_command": {
      const parts: string[] = [];
      if (typeof out.exitCode === "number")
        parts.push(`کد خروج: ${out.exitCode}`);
      if (out.timedOut === true) parts.push("اتمام زمان");
      return parts.length > 0 ? parts.join(" · ") : null;
    }
    case "create_artifact": {
      const kindLabels: Record<string, string> = {
        html: "HTML",
        markdown: "مارک‌داون",
        svg: "SVG",
        mermaid: "نمودار",
        code: "کد",
        data: "داده",
      };
      if (typeof out.kind !== "string") return null;
      return kindLabels[out.kind] ?? out.kind;
    }
    case "update_task":
      return typeof out.status === "string" ? String(out.status) : null;
    default:
      return null;
  }
}

/** Resolves a reveal deep-link from a tool result, if any. */
function getRevealAction(
  toolName: string,
  output: unknown,
  workspaceId: string
): { label: string; run: () => void } | null {
  if (output == null || typeof output !== "object") return null;
  const out = output as Record<string, unknown>;

  if (toolName === "create_artifact") {
    const artifactId = typeof out.id === "string" ? out.id : "";
    return {
      label: "نمایش آرتیفکت",
      run: () =>
        requestReveal({ kind: "artifact", workspaceId, artifactId }),
    };
  }
  if (toolName === "update_task") {
    return {
      label: "نمایش تسک",
      run: () => requestReveal({ kind: "task", workspaceId, taskId: "" }),
    };
  }
  const filePath =
    typeof out.path === "string"
      ? out.path
      : typeof out.to === "string"
        ? out.to
        : null;
  if (
    filePath &&
    ["write_file", "apply_patch", "read_file", "move_file"].includes(toolName)
  ) {
    return {
      label: "نمایش در فایل‌ها",
      run: () => requestReveal({ kind: "file", workspaceId, path: filePath }),
    };
  }
  return null;
}

function formatOutput(output: unknown): string | null {
  if (output == null) return null;
  if (typeof output === "string") return output;
  try {
    return JSON.stringify(output, null, 2);
  } catch {
    return null;
  }
}

export function ChatWorkspaceToolPart({
  part,
  workspaceId,
}: {
  part: WorkspaceToolPart;
  workspaceId?: string | null;
}) {
  const toolName = getToolName(part.type);
  const isLoading =
    part.state === "input-streaming" ||
    part.state === "input-available" ||
    part.state === "approval-requested" ||
    part.state === "approval-responded";
  const isError =
    part.state === "output-error" ||
    part.state === "output-denied" ||
    (typeof part.output === "object" &&
      part.output !== null &&
      "success" in (part.output as Record<string, unknown>) &&
      (part.output as { success?: boolean }).success === false);
  const subject = getSubject(toolName, part.input);
  const outputText = isLoading ? null : formatOutput(part.output);
  const errorText = part.errorText;
  const summary = isLoading || isError ? null : getResultSummary(toolName, part.output);
  const revealAction =
    !isLoading && !isError && workspaceId
      ? getRevealAction(toolName, part.output, workspaceId)
      : null;

  // Auto-open Artifacts → preview when create_artifact finishes this turn.
  // Only fires on a live loading→done transition (not when hydrating history).
  const wasLoadingRef = useRef(isLoading);
  useEffect(() => {
    const wasLoading = wasLoadingRef.current;
    wasLoadingRef.current = isLoading;
    if (!wasLoading || isLoading || isError || !workspaceId) return;
    if (toolName !== "create_artifact") return;
    if (part.output == null || typeof part.output !== "object") return;
    const artifactId = (part.output as { id?: unknown }).id;
    if (typeof artifactId !== "string" || !artifactId) return;
    requestReveal({ kind: "artifact", workspaceId, artifactId });
  }, [isLoading, isError, toolName, workspaceId, part.output]);

  const baseLabel = isLoading
    ? TOOL_LOADING_LABELS[toolName] ?? `در حال اجرای ${toolName}…`
    : isError
      ? TOOL_ERROR_LABELS[toolName] ?? `خطا در اجرای ${toolName}`
      : TOOL_DONE_LABELS[toolName] ?? `${toolName} اجرا شد`;

  const label = (
    <>
      {baseLabel}
      {subject ? (
        <>
          {" "}
          <span dir="ltr" className="font-mono text-[11px] opacity-80">
            {subject.length > 60 ? `${subject.slice(0, 60)}…` : subject}
          </span>
        </>
      ) : null}
      {summary ? (
        <span className="ms-1.5 text-[11px] text-muted-foreground">
          · {summary}
        </span>
      ) : null}
    </>
  );

  const panel = !isLoading ? (
    <div dir="ltr" className="space-y-2 text-xs leading-5">
      {errorText ? (
        <pre className="whitespace-pre-wrap break-words text-destructive/90">
          {errorText}
        </pre>
      ) : outputText ? (
        <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words">
          {outputText}
        </pre>
      ) : (
        <p className="text-muted-foreground">بدون خروجی</p>
      )}
      {revealAction ? (
        <div dir="rtl">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="gap-1.5"
            onClick={revealAction.run}
          >
            <ExternalLinkIcon className="size-3.5" />
            {revealAction.label}
          </Button>
        </div>
      ) : null}
    </div>
  ) : null;

  return (
    <ChatToolInvocation
      icon={TOOL_ICONS[toolName] ?? <TerminalIcon />}
      label={label}
      isLoading={isLoading}
      isError={isError}
      expandable={Boolean(panel)}
      panelTitle="جزئیات"
    >
      {panel}
    </ChatToolInvocation>
  );
}
