"use client";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Marker,
  MarkerContent,
  MarkerIcon,
  markerVariants,
} from "@/components/ui/marker";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { ChevronDownIcon } from "lucide-react";
import { useState, type ReactNode } from "react";

type ChatToolInvocationProps = {
  label: ReactNode;
  icon?: ReactNode;
  isLoading?: boolean;
  isError?: boolean;
  expandable?: boolean;
  panelTitle?: string;
  children?: ReactNode;
};

function ToolMarkerContent({
  label,
  icon,
  isLoading,
  isError,
  showChevron,
  chevronOpen,
}: {
  label: ReactNode;
  icon?: ReactNode;
  isLoading: boolean;
  isError: boolean;
  showChevron?: boolean;
  chevronOpen?: boolean;
}) {
  return (
    <>
      <MarkerIcon>
        {isLoading ? <Spinner className="size-3.5" /> : icon}
      </MarkerIcon>
      <MarkerContent
        dir="rtl"
        className={cn(
          "min-w-0 flex-1 truncate text-right",
          isLoading && "shimmer",
          isError && "text-destructive/90"
        )}
      >
        {label}
      </MarkerContent>
      {showChevron ? (
        <ChevronDownIcon
          className={cn(
            "size-3.5 shrink-0 text-muted-foreground/70 transition-transform",
            chevronOpen && "rotate-180"
          )}
        />
      ) : null}
    </>
  );
}

export function ChatToolInvocation({
  label,
  icon,
  isLoading = false,
  isError = false,
  expandable = false,
  panelTitle,
  children,
}: ChatToolInvocationProps) {
  const [open, setOpen] = useState(false);
  const canExpand = expandable && !isLoading && Boolean(children);

  const markerClassName = cn(
    markerVariants({ variant: "border" }),
    "w-full py-0.5 text-xs leading-5"
  );

  if (!canExpand) {
    return (
      <Marker
        dir="rtl"
        variant="border"
        role={isLoading ? "status" : undefined}
        className={markerClassName}
      >
        <ToolMarkerContent
          label={label}
          icon={icon}
          isLoading={isLoading}
          isError={isError}
        />
      </Marker>
    );
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="w-full">
      <CollapsibleTrigger
        dir="rtl"
        role={isLoading ? "status" : undefined}
        className={cn(
          markerClassName,
          "cursor-pointer transition-colors hover:text-foreground/90"
        )}
      >
        <ToolMarkerContent
          label={label}
          icon={icon}
          isLoading={isLoading}
          isError={isError}
          showChevron
          chevronOpen={open}
        />
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
