"use client";

import { Spinner } from "@/components/ui/spinner";
import { AlertCircleIcon, CheckCircle2Icon, SparklesIcon } from "lucide-react";

type ExpertToolPart = {
  type: string;
  state: string;
  input?: { name?: string; slug?: string };
  output?: { success?: boolean; slug?: string; error?: string };
  errorText?: string;
};

export function ChatExpertToolPart({ part }: { part: ExpertToolPart }) {
  const isCreation = part.type === "tool-create_expert";
  const isLoading = part.state === "input-streaming" || part.state === "input-available";
  const isError = part.state === "output-error" || (!isLoading && part.output?.success === false);
  const slug = isCreation
    ? part.output?.slug ?? part.input?.slug
    : part.type.replace(/^tool-expert_/, "").replace(/_/g, "-");

  return (
    <div
      dir="rtl"
      role="status"
      className="flex w-full items-center gap-2 rounded-lg border border-border/60 bg-muted/35 px-2 py-1 text-xs leading-5 text-muted-foreground"
    >
      {isLoading ? (
        <Spinner className="size-3" />
      ) : isError ? (
        <AlertCircleIcon className="size-3 text-destructive" />
      ) : isCreation ? (
        <CheckCircle2Icon className="size-3 text-emerald-600" />
      ) : (
        <SparklesIcon className="size-3" />
      )}
      <span>
        {isLoading
          ? isCreation
            ? "در حال بررسی و ساخت متخصص…"
            : `متخصص /${slug} در حال انجام درخواست است…`
          : isError
            ? part.output?.error || part.errorText || "ساخت یا اجرای متخصص ناموفق بود؛ دوباره تلاش کنید."
            : isCreation
              ? `متخصص /${slug ?? "expert"} ساخته و آماده استفاده شد`
              : `متخصص /${slug} پاسخ داد`}
      </span>
    </div>
  );
}
