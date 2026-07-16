"use client";

import { Spinner } from "@/components/ui/spinner";
import { SparklesIcon } from "lucide-react";

type ExpertToolPart = {
  type: string;
  state: string;
  input?: { name?: string; slug?: string };
  output?: { success?: boolean; slug?: string };
};

export function ChatExpertToolPart({ part }: { part: ExpertToolPart }) {
  const isCreation = part.type === "tool-create_expert";
  const isLoading = part.state === "input-streaming" || part.state === "input-available";
  const slug = isCreation
    ? part.output?.slug ?? part.input?.slug
    : part.type.replace(/^tool-expert_/, "").replace(/_/g, "-");

  return (
    <div dir="rtl" className="flex w-full items-center gap-2 rounded-lg border border-border/60 bg-muted/35 px-2 py-1 text-xs leading-5 text-muted-foreground">
      {isLoading ? <Spinner className="size-3" /> : <SparklesIcon className="size-3" />}
      <span>
        {isLoading
          ? isCreation ? "در حال ساخت متخصص…" : `متخصص ${slug} در حال کار است…`
          : isCreation ? `متخصص /${slug ?? "expert"} ساخته شد` : `متخصص /${slug} پاسخ داد`}
      </span>
    </div>
  );
}
