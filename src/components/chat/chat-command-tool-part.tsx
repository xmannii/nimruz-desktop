"use client";

import { ChatToolInvocation } from "@/components/chat/chat-tool-invocation";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { TerminalIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

export type CommandToolPart = {
  type: string;
  toolCallId: string;
  state: string;
  preliminary?: boolean;
  input?: Record<string, unknown>;
  output?: unknown;
  errorText?: string;
};

type CommandOutput = {
  status?: "running" | "completed";
  command?: string;
  cwd?: string;
  exitCode?: number | null;
  signal?: string | null;
  stdout?: string;
  stderr?: string;
  truncated?: boolean;
  liveTruncated?: boolean;
  timedOut?: boolean;
  durationMs?: number;
};

const ANSI_ESCAPE_PATTERN = /\u001B(?:[@-_]|\[[0-?]*[ -/]*[@-~])/g;

function asCommandOutput(output: unknown): CommandOutput {
  return output && typeof output === "object"
    ? (output as CommandOutput)
    : {};
}

function cleanTerminalText(value: string): string {
  return value
    .replace(ANSI_ESCAPE_PATTERN, "")
    .replaceAll("\r\n", "\n")
    .replaceAll("\r", "\n");
}

function formatDuration(durationMs: number): string {
  const seconds = Math.max(0, Math.floor(durationMs / 1_000));
  if (seconds < 60) return `${seconds.toLocaleString("fa-IR")} ثانیه`;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes.toLocaleString("fa-IR")}:${remainder
    .toLocaleString("fa-IR")
    .padStart(2, "۰")}`;
}

export function ChatCommandToolPart({ part }: { part: CommandToolPart }) {
  const output = asCommandOutput(part.output);
  const command =
    (typeof output.command === "string" && output.command) ||
    (typeof part.input?.command === "string" && part.input.command) ||
    "دستور";
  const cwd =
    (typeof output.cwd === "string" && output.cwd) ||
    (typeof part.input?.cwd === "string" && part.input.cwd) ||
    "";
  const isPendingInput =
    part.state === "input-streaming" ||
    part.state === "input-available" ||
    part.state === "approval-requested" ||
    part.state === "approval-responded";
  const isRunning =
    isPendingInput || part.preliminary === true || output.status === "running";
  const isErrorState =
    part.state === "output-error" || part.state === "output-denied";
  const hasBadExitCode =
    typeof output.exitCode === "number" && output.exitCode !== 0;
  const isError =
    !isRunning &&
    (isErrorState ||
      hasBadExitCode ||
      output.timedOut === true ||
      typeof output.signal === "string");
  const startedAtRef = useRef(Date.now());
  const [clock, setClock] = useState(() => Date.now());
  const terminalRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    if (!isRunning) return;
    const timer = window.setInterval(() => setClock(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [isRunning]);

  const terminalOutput = useMemo(() => {
    const stdout = typeof output.stdout === "string" ? output.stdout : "";
    const stderr = typeof output.stderr === "string" ? output.stderr : "";
    const combined = [stdout, stderr].filter(Boolean).join(
      stdout && stderr && !stdout.endsWith("\n") ? "\n" : ""
    );
    return cleanTerminalText(combined || part.errorText || "");
  }, [output.stderr, output.stdout, part.errorText]);

  useEffect(() => {
    if (!isRunning || !terminalRef.current) return;
    terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
  }, [isRunning, terminalOutput]);

  const durationMs = isRunning
    ? Math.max(output.durationMs ?? 0, clock - startedAtRef.current)
    : (output.durationMs ?? clock - startedAtRef.current);
  const statusLabel = isRunning
    ? "در حال اجرا"
    : output.timedOut
      ? "مهلت اجرا تمام شد"
      : output.signal
        ? "اجرا متوقف شد"
        : isError
          ? "اجرا ناموفق بود"
          : "با موفقیت اجرا شد";
  const label = (
    <>
      <span>{statusLabel}</span>{" "}
      <span dir="ltr" className="font-mono text-[11px] opacity-80">
        {command.length > 64 ? `${command.slice(0, 64)}…` : command}
      </span>
      <span className="ms-1.5 text-[11px] text-muted-foreground">
        · {formatDuration(durationMs)}
      </span>
    </>
  );

  return (
    <ChatToolInvocation
      icon={<TerminalIcon />}
      label={label}
      isLoading={isRunning}
      isError={isError}
      expandable
      expandableWhileLoading
      expandMode="click"
      defaultExpanded={isRunning}
    >
      <div className="flex flex-col gap-2">
        <div className="flex min-w-0 items-center justify-between gap-2">
          <Badge
            variant={
              isError ? "destructive" : isRunning ? "secondary" : "outline"
            }
          >
            {isRunning ? <Spinner /> : null}
            {statusLabel}
          </Badge>
          {cwd ? (
            <span
              dir="ltr"
              title={cwd}
              className="min-w-0 truncate font-mono text-[10px] text-muted-foreground"
            >
              {cwd}
            </span>
          ) : null}
        </div>

        <div
          dir="ltr"
          className="overflow-hidden rounded-md border border-border/60 bg-muted/35 text-left font-mono"
        >
          <div className="flex items-start gap-2 border-b border-border/50 px-2.5 py-2 text-[11px] leading-5">
            <span className="shrink-0 select-none text-primary">$</span>
            <code className="min-w-0 whitespace-pre-wrap break-all">
              {command}
            </code>
          </div>
          <pre
            ref={terminalRef}
            aria-live={isRunning ? "polite" : undefined}
            className="max-h-44 min-h-14 overflow-auto whitespace-pre-wrap break-words px-2.5 py-2 text-[11px] leading-5"
          >
            {terminalOutput ||
              (isRunning ? "در انتظار خروجی…" : "بدون خروجی")}
          </pre>
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
          <span>زمان: {formatDuration(durationMs)}</span>
          {typeof output.exitCode === "number" ? (
            <span>کد خروج: {output.exitCode.toLocaleString("fa-IR")}</span>
          ) : null}
          {output.signal ? <span dir="ltr">سیگنال: {output.signal}</span> : null}
          {output.truncated ? <span>خروجی کوتاه شده است</span> : null}
          {output.liveTruncated ? (
            <span>در حال نمایش آخرین بخش خروجی زنده</span>
          ) : null}
        </div>
      </div>
    </ChatToolInvocation>
  );
}
