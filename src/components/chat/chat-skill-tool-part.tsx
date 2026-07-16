"use client";

import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { BookOpenIcon } from "lucide-react";

type LoadSkillToolPart = {
  type: "tool-load_skill";
  toolCallId: string;
  state: string;
  input?: {
    name?: string;
  };
  output?: {
    success?: boolean;
    name?: string;
    error?: string;
  };
};

const shellClassName =
  "flex w-full items-center gap-1.5 rounded-lg border border-border/60 bg-muted/35 px-2 py-1 text-xs leading-5";

export function ChatSkillToolPart({ part }: { part: LoadSkillToolPart }) {
  const skillName = part.input?.name ?? part.output?.name;
  const isLoading =
    part.state === "input-streaming" || part.state === "input-available";

  if (isLoading) {
    return (
      <div dir="rtl" className={cn(shellClassName, "text-muted-foreground")}>
        <Spinner className="size-3 shrink-0" />
        <span>
          در حال بارگذاری مهارت
          {skillName ? (
            <>
              {" "}
              <span dir="ltr" className="font-mono">
                {skillName}
              </span>
            </>
          ) : (
            "…"
          )}
        </span>
      </div>
    );
  }

  if (part.state === "output-error" || part.output?.success === false) {
    return (
      <div
        dir="rtl"
        className={cn(
          shellClassName,
          "border-destructive/30 bg-destructive/5 text-destructive"
        )}
      >
        <BookOpenIcon className="size-3 shrink-0" />
        <span className="font-medium">خطا در بارگذاری مهارت</span>
        {part.output?.error ? (
          <span className="min-w-0 truncate text-destructive/80">
            {part.output.error}
          </span>
        ) : null}
      </div>
    );
  }

  return (
    <div dir="rtl" className={shellClassName}>
      <BookOpenIcon className="size-3 shrink-0 text-muted-foreground" />
      <span className="shrink-0 font-medium text-foreground">مهارت بارگذاری شد</span>
      {skillName ? (
        <span dir="ltr" className="min-w-0 truncate font-mono text-muted-foreground">
          {skillName}
        </span>
      ) : null}
    </div>
  );
}
