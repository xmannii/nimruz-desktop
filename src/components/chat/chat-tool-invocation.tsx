"use client";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { ChevronDownIcon } from "lucide-react";
import { useState, type ReactNode } from "react";

type ChatToolInvocationProps = {
  label: ReactNode;
  isLoading?: boolean;
  isError?: boolean;
  expandable?: boolean;
  panelTitle?: string;
  children?: ReactNode;
};

export function ChatToolInvocation({
  label,
  isLoading = false,
  isError = false,
  expandable = false,
  panelTitle,
  children,
}: ChatToolInvocationProps) {
  const [open, setOpen] = useState(false);
  const canExpand = expandable && !isLoading && Boolean(children);

  const triggerContent = (
    <>
      {canExpand ? (
        <ChevronDownIcon
          className={cn(
            "size-3 shrink-0 text-muted-foreground/70 transition-transform",
            open && "rotate-180"
          )}
        />
      ) : null}
      <span
        className={cn(
          "min-w-0 flex-1 truncate text-right",
          isError ? "text-destructive/90" : "text-muted-foreground"
        )}
      >
        {label}
      </span>
      {isLoading ? <Spinner className="size-3 shrink-0" /> : null}
    </>
  );

  if (!canExpand) {
    return (
      <div
        dir="rtl"
        role="status"
        className="flex w-full items-center gap-1.5 py-0.5 text-right text-xs leading-5"
      >
        {triggerContent}
      </div>
    );
  }

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      dir="rtl"
      className="w-full"
    >
      <CollapsibleTrigger className="flex w-full cursor-pointer items-center gap-1.5 py-0.5 text-right text-xs leading-5 transition-colors hover:text-foreground/80">
        {triggerContent}
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-1.5">
        <div
          dir="rtl"
          className="max-h-48 overflow-y-auto overscroll-contain rounded-xl border border-border/60 bg-muted/25 px-3 py-2.5 text-right text-sm leading-6 text-foreground"
        >
          {panelTitle ? (
            <p className="mb-2 text-[11px] font-medium text-muted-foreground">
              {panelTitle}
            </p>
          ) : null}
          {children}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
