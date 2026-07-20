"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  CheckIcon,
  ShieldCheckIcon,
  TerminalIcon,
  XIcon,
} from "lucide-react";

type ApprovalToolPart = {
  type: string;
  toolCallId: string;
  state: "approval-requested" | "approval-responded";
  input?: unknown;
  approval: {
    id: string;
    approved?: boolean;
    reason?: string;
    isAutomatic?: boolean;
  };
};

type RiskLevel = "read" | "write" | "shell" | "destructive" | "network";

const TOOL_META: Record<string, { label: string; risk: RiskLevel }> = {
  list_directory: { label: "فهرست پوشه", risk: "read" },
  read_file: { label: "خواندن فایل", risk: "read" },
  search_files: { label: "جستجوی فایل", risk: "read" },
  grep: { label: "جستجوی فایل", risk: "read" },
  write_file: { label: "نوشتن فایل", risk: "write" },
  apply_patch: { label: "ویرایش فایل", risk: "write" },
  move_file: { label: "جابه‌جایی فایل", risk: "write" },
  create_artifact: { label: "آرتیفکت", risk: "write" },
  update_task: { label: "تسک", risk: "write" },
  write_plan: { label: "پلن", risk: "write" },
  update_plan: { label: "پلن", risk: "write" },
  read_active_plan: { label: "خواندن پلن", risk: "read" },
  update_plan_progress: { label: "پیشرفت پلن", risk: "write" },
  update_plan_status: { label: "وضعیت پلن", risk: "write" },
  ask_user_question: { label: "سوال", risk: "read" },
  delete_file: { label: "حذف فایل", risk: "destructive" },
  run_command: { label: "اجرای دستور", risk: "shell" },
  fetch_url: { label: "دریافت وب", risk: "network" },
  web_search: { label: "جستجوی وب", risk: "network" },
};

const ALWAYS_APPROVE_TEXT: Partial<Record<RiskLevel, string>> = {
  read: "همیشه بخوان",
  write: "همیشه بنویس",
  shell: "همیشه اجرا کن",
  network: "همیشه وب",
};

function getToolMeta(type: string): { label: string; risk: RiskLevel } {
  const name = type.replace(/^tool-/, "");
  return TOOL_META[name] ?? { label: name, risk: "write" };
}

function getSubject(type: string, input: unknown): string | null {
  if (!input || typeof input !== "object") return null;
  const record = input as Record<string, unknown>;
  const name = type.replace(/^tool-/, "");
  const raw =
    name === "run_command"
      ? record.command
      : (record.path ?? record.from ?? record.query ?? record.url ?? record.title);
  if (typeof raw !== "string" || !raw.trim()) return null;
  const value = raw.trim();
  return value.length > 72 ? `${value.slice(0, 72)}…` : value;
}

function getCommand(type: string, input: unknown): string | null {
  if (type.replace(/^tool-/, "") !== "run_command") return null;
  if (!input || typeof input !== "object") return null;

  const command = (input as Record<string, unknown>).command;
  return typeof command === "string" && command.trim() ? command.trim() : null;
}

export function ToolApprovalCard({
  part,
  onApprove,
  onApproveAlways,
  onDeny,
  isResponding = false,
}: {
  part: ApprovalToolPart;
  workspaceId?: string | null;
  onApprove: () => void;
  /** Approve now and auto-approve this risk category in the future. */
  onApproveAlways?: () => void;
  onDeny: () => void;
  isResponding?: boolean;
}) {
  const { label, risk } = getToolMeta(part.type);
  const subject = getSubject(part.type, part.input);
  const command = getCommand(part.type, part.input);
  const isDestructive = risk === "destructive";
  const HeaderIcon = command ? TerminalIcon : ShieldCheckIcon;

  return (
    <div
      dir="rtl"
      className={cn(
        "w-full overflow-hidden rounded-xl border",
        isDestructive
          ? "border-destructive/35 bg-destructive/5"
          : "border-border/60 bg-muted/30"
      )}
    >
      <div className="flex items-start gap-2 px-3 pt-2.5 text-right">
        <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <HeaderIcon className="size-3" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-foreground">
            {command ? "تأیید اجرای دستور" : label}
          </p>
          {command ? (
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              این دستور در ترمینال فضای کاری اجرا می‌شود.
            </p>
          ) : subject ? (
            <p dir="ltr" className="truncate font-mono text-[11px] text-muted-foreground">
              {subject}
            </p>
          ) : null}
        </div>
      </div>

      {command ? (
        <div
          dir="ltr"
          className="mx-3 mt-2.5 overflow-hidden rounded-lg border border-black/20 bg-zinc-950 text-left shadow-inner dark:border-white/10"
        >
          <div className="flex h-7 items-center gap-1 border-b border-white/10 bg-white/5 px-2.5">
            <span className="size-2 rounded-full bg-red-400/75" />
            <span className="size-2 rounded-full bg-amber-400/75" />
            <span className="size-2 rounded-full bg-emerald-400/75" />
            <span className="ml-1.5 font-mono text-[10px] text-zinc-400">terminal</span>
          </div>
          <pre className="max-h-48 overflow-auto p-3 font-mono text-xs leading-5 whitespace-pre-wrap break-words text-zinc-100">
            <code><span className="mr-2 select-none text-emerald-400">$</span>{command}</code>
          </pre>
        </div>
      ) : null}

      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 border-t border-border/50 bg-background/30 px-3 py-2">
        <span className="text-[10px] text-muted-foreground">
          {isDestructive ? "عملیات غیرقابل بازگشت است" : "اجازه فقط برای این درخواست"}
        </span>
        <div className="flex shrink-0 flex-wrap items-center gap-1">
        <Button
          type="button"
          size="xs"
          variant={isDestructive ? "destructive" : "default"}
          disabled={isResponding}
          onClick={onApprove}
        >
          <CheckIcon />
          {isDestructive ? "حذف" : "اجازه"}
        </Button>
        {onApproveAlways && !isDestructive && ALWAYS_APPROVE_TEXT[risk] ? (
          <Button
            type="button"
            size="xs"
            variant="secondary"
            disabled={isResponding}
            onClick={onApproveAlways}
          >
            <ShieldCheckIcon />
            {ALWAYS_APPROVE_TEXT[risk]}
          </Button>
        ) : null}
        <Button
          type="button"
          size="xs"
          variant="ghost"
          disabled={isResponding}
          onClick={onDeny}
        >
          <XIcon />
          رد
        </Button>
        </div>
      </div>
    </div>
  );
}
