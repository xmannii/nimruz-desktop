"use client";

import { ChatToolInvocation } from "@/components/chat/chat-tool-invocation";
import { cn } from "@/lib/utils";
import {
  CheckIcon,
  FilePlus2Icon,
  FileSearchIcon,
  FileTextIcon,
  FolderIcon,
  GlobeIcon,
  ListTodoIcon,
  MoveIcon,
  PencilIcon,
  SearchIcon,
  SparklesIcon,
  TerminalIcon,
  Trash2Icon,
  WrenchIcon,
  XIcon,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";

export type CompactableToolPart = {
  type: string;
  toolCallId?: string;
  state: string;
  input?: Record<string, unknown>;
  output?: unknown;
  errorText?: string;
};

/** Collapse a whole tool run once it gets this long. */
export const COMPACT_TOOL_THRESHOLD = 3;

const TOOL_ICONS: Record<string, LucideIcon> = {
  list_directory: FolderIcon,
  read_file: FileTextIcon,
  search_files: SearchIcon,
  grep: SearchIcon,
  write_file: FilePlus2Icon,
  apply_patch: PencilIcon,
  move_file: MoveIcon,
  delete_file: Trash2Icon,
  run_command: TerminalIcon,
  create_artifact: FileSearchIcon,
  update_task: ListTodoIcon,
  fetch_url: GlobeIcon,
  load_skill: SparklesIcon,
  save_memory: SparklesIcon,
  delete_memory: SparklesIcon,
};

const TOOL_DONE_LABELS: Record<string, string> = {
  list_directory: "فهرست شد",
  read_file: "خوانده شد",
  search_files: "جستجو شد",
  grep: "جستجو شد",
  write_file: "نوشته شد",
  apply_patch: "ویرایش شد",
  move_file: "منتقل شد",
  delete_file: "حذف شد",
  run_command: "اجرا شد",
  create_artifact: "آرتیفکت",
  update_task: "تسک",
  fetch_url: "صفحه",
  load_skill: "مهارت",
  save_memory: "حافظه",
  delete_memory: "حذف حافظه",
};

export function getToolNameFromPartType(type: string): string {
  return type.replace(/^tool-/, "");
}

export function isPartLoading(part: CompactableToolPart): boolean {
  return (
    part.state === "input-streaming" ||
    part.state === "input-available" ||
    part.state === "approval-requested" ||
    part.state === "approval-responded"
  );
}

export function isPartError(part: CompactableToolPart): boolean {
  if (part.state === "output-error" || part.state === "output-denied") {
    return true;
  }
  if (
    typeof part.output === "object" &&
    part.output !== null &&
    "success" in (part.output as Record<string, unknown>) &&
    (part.output as { success?: boolean }).success === false
  ) {
    return true;
  }
  return false;
}

function getPartSubject(toolName: string, part: CompactableToolPart): string | null {
  const input = part.input;
  if (!input) return null;

  const candidate =
    input.path ??
    input.url ??
    input.query ??
    input.command ??
    input.title ??
    input.from ??
    input.name;
  if (typeof candidate === "string" && candidate.trim()) {
    const value = candidate.trim();
    return value.length > 64 ? `${value.slice(0, 64)}…` : value;
  }
  return null;
}

function summarizeRun(parts: CompactableToolPart[]): {
  isLoading: boolean;
  isError: boolean;
  errorCount: number;
  label: ReactNode;
} {
  const count = parts.length;
  const loadingCount = parts.filter(isPartLoading).length;
  const errorCount = parts.filter(isPartError).length;
  const isLoading = loadingCount > 0;
  const isError = !isLoading && errorCount === count;
  const countLabel = count.toLocaleString("fa-IR");

  if (isLoading) {
    return {
      isLoading: true,
      isError: false,
      errorCount,
      label: `در حال انجام ${countLabel} اقدام…`,
    };
  }

  if (isError) {
    return {
      isLoading: false,
      isError: true,
      errorCount,
      label: `${countLabel} اقدام با خطا`,
    };
  }

  return {
    isLoading: false,
    isError: false,
    errorCount,
    label: (
      <>
        {`${countLabel} اقدام انجام شد`}
        {errorCount > 0 ? (
          <span className="ms-1.5 text-[11px] text-destructive/80">
            · {errorCount.toLocaleString("fa-IR")} خطا
          </span>
        ) : null}
      </>
    ),
  };
}

export function ChatCompactToolBatch({
  parts,
}: {
  parts: CompactableToolPart[];
}) {
  const { isLoading, isError, label } = summarizeRun(parts);

  return (
    <ChatToolInvocation
      icon={<WrenchIcon />}
      label={label}
      isLoading={isLoading}
      isError={isError}
      expandable={!isLoading}
      expandMode="click"
      panelTitle="جزئیات اقدامات"
    >
      <ul className="space-y-0.5" dir="rtl">
        {parts.map((part, index) => {
          const toolName = getToolNameFromPartType(part.type);
          const Icon = TOOL_ICONS[toolName] ?? WrenchIcon;
          const subject = getPartSubject(toolName, part);
          const loading = isPartLoading(part);
          const error = isPartError(part);
          const actionLabel =
            TOOL_DONE_LABELS[toolName] ?? toolName.replaceAll("_", " ");

          return (
            <li
              key={part.toolCallId ?? `${toolName}-${index}`}
              className="flex items-start gap-2 rounded-md px-1 py-1.5"
            >
              <span
                className={cn(
                  "mt-0.5 flex size-3.5 shrink-0 items-center justify-center",
                  error
                    ? "text-destructive"
                    : loading
                      ? "text-muted-foreground"
                      : "text-muted-foreground/70"
                )}
              >
                {loading ? (
                  <span className="size-1.5 rounded-full bg-foreground/40" />
                ) : error ? (
                  <XIcon className="size-3" />
                ) : (
                  <CheckIcon className="size-3" />
                )}
              </span>

              <span className="mt-0.5 flex size-3.5 shrink-0 items-center justify-center text-muted-foreground [&_svg]:size-3">
                <Icon />
              </span>

              <span className="min-w-0 flex-1 text-right text-[11px] leading-5">
                <span className="text-muted-foreground">{actionLabel}</span>
                {subject ? (
                  <>
                    {" "}
                    <span
                      dir="ltr"
                      className={cn(
                        "break-all font-mono text-[11px]",
                        error && "text-destructive/90",
                        loading && "text-muted-foreground"
                      )}
                    >
                      {subject}
                    </span>
                  </>
                ) : null}
              </span>
            </li>
          );
        })}
      </ul>
    </ChatToolInvocation>
  );
}
