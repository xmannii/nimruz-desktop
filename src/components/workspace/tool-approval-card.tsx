"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CheckIcon, ShieldCheckIcon, XIcon } from "lucide-react";

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
  write_file: { label: "نوشتن فایل", risk: "write" },
  apply_patch: { label: "ویرایش فایل", risk: "write" },
  move_file: { label: "جابه‌جایی فایل", risk: "write" },
  create_artifact: { label: "آرتیفکت", risk: "write" },
  update_task: { label: "تسک", risk: "write" },
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
  const isDestructive = risk === "destructive";

  return (
    <div
      dir="rtl"
      className={cn(
        "flex w-full flex-wrap items-center gap-2 rounded-xl border px-3 py-2",
        isDestructive
          ? "border-destructive/35 bg-destructive/5"
          : "border-border/60 bg-muted/30"
      )}
    >
      <div className="min-w-0 flex-1 text-right">
        <p className="truncate text-sm text-foreground">
          <span className="font-medium">{label}</span>
          {subject ? (
            <>
              {" "}
              <span
                dir="ltr"
                className="font-mono text-[11px] text-muted-foreground"
              >
                {subject}
              </span>
            </>
          ) : null}
        </p>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-1.5">
        <Button
          type="button"
          size="sm"
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
            size="sm"
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
          size="sm"
          variant="ghost"
          disabled={isResponding}
          onClick={onDeny}
        >
          <XIcon />
          رد
        </Button>
      </div>
    </div>
  );
}
