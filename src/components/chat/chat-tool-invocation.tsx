"use client";

import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import {
  Children,
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type StepPosition = "single" | "first" | "middle" | "last";

type ToolStepContextValue = {
  position: StepPosition;
  index: number;
  total: number;
};

const ToolStepContext = createContext<ToolStepContextValue | null>(null);

function stepPosition(index: number, total: number): StepPosition {
  if (total <= 1) return "single";
  if (index === 0) return "first";
  if (index === total - 1) return "last";
  return "middle";
}

/** Wraps consecutive tool calls as a connected step timeline. */
export function ChatToolStepGroup({
  leading,
  children,
  className,
}: {
  /** Optional first step (e.g. reasoning) drawn above the tools. */
  leading?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  const items = Children.toArray(children).filter(Boolean);
  const allItems = leading != null ? [leading, ...items] : items;
  if (allItems.length === 0) return null;

  if (allItems.length === 1) {
    return (
      <ToolStepContext.Provider
        value={{ position: "single", index: 0, total: 1 }}
      >
        <div className={cn("my-0.5", className)}>{allItems[0]}</div>
      </ToolStepContext.Provider>
    );
  }

  return (
    <ol
      dir="rtl"
      className={cn(
        "my-1 flex list-none flex-col gap-0 rounded-xl border border-border/50 bg-muted/15 px-2 py-1.5",
        className
      )}
    >
      {allItems.map((child, index) => (
        <li key={index}>
          <ToolStepContext.Provider
            value={{
              position: stepPosition(index, allItems.length),
              index,
              total: allItems.length,
            }}
          >
            {child}
          </ToolStepContext.Provider>
        </li>
      ))}
    </ol>
  );
}

function ToolInvocationRow({
  label,
  icon,
  isLoading,
  isError,
  stepLabel,
  clickable,
  expanded,
  onToggle,
}: {
  label: ReactNode;
  icon?: ReactNode;
  isLoading: boolean;
  isError: boolean;
  stepLabel: string | null;
  clickable: boolean;
  expanded: boolean;
  onToggle: () => void;
}) {
  const rowClassName = cn(
    "flex w-full min-h-7 items-center gap-2 py-1 pe-1 text-right",
    isLoading && "opacity-90",
    clickable && "cursor-pointer"
  );

  const rowBody = (
    <>
      <span
        className={cn(
          "flex size-4 shrink-0 items-center justify-center text-muted-foreground transition-colors",
          "[&_svg:not([class*='size-'])]:size-3.5",
          "group-hover/tool:text-foreground/80",
          isError && "text-destructive"
        )}
      >
        {isLoading ? <Spinner className="size-3.5" /> : icon}
      </span>

      <div
        className={cn(
          "min-w-0 flex-1 truncate text-right text-xs leading-5 text-muted-foreground transition-colors",
          "group-hover/tool:text-foreground/90",
          isLoading && "shimmer text-muted-foreground",
          isError && "text-destructive/90"
        )}
      >
        {label}
      </div>

      {stepLabel ? (
        <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground/60 opacity-0 transition-opacity group-hover/tool:opacity-100">
          {stepLabel}
        </span>
      ) : null}
    </>
  );

  if (clickable) {
    return (
      <button
        type="button"
        aria-expanded={expanded}
        onClick={onToggle}
        className={rowClassName}
      >
        {rowBody}
      </button>
    );
  }

  return (
    <div className={rowClassName} role={isLoading ? "status" : undefined}>
      {rowBody}
    </div>
  );
}

type ChatToolInvocationProps = {
  label: ReactNode;
  icon?: ReactNode;
  isLoading?: boolean;
  isError?: boolean;
  expandable?: boolean;
  /** Hover expands by default; click is better for compact batches. */
  expandMode?: "hover" | "click";
  defaultExpanded?: boolean;
  panelTitle?: string;
  children?: ReactNode;
};

export function ChatToolInvocation({
  label,
  icon,
  isLoading = false,
  isError = false,
  expandable = false,
  expandMode = "hover",
  defaultExpanded = false,
  panelTitle,
  children,
}: ChatToolInvocationProps) {
  const step = useContext(ToolStepContext);
  const position = step?.position ?? "single";
  const canExpand = expandable && !isLoading && Boolean(children);
  const inStack = position !== "single";
  const [clickExpanded, setClickExpanded] = useState(defaultExpanded);
  const detailsOpen =
    canExpand && (expandMode === "click" ? clickExpanded : true);

  const stepLabel = useMemo(() => {
    if (!step || step.total <= 1) return null;
    return `${(step.index + 1).toLocaleString("fa-IR")} از ${step.total.toLocaleString("fa-IR")}`;
  }, [step]);

  return (
    <div
      dir="rtl"
      className={cn(
        "group/tool relative flex gap-2.5",
        inStack ? "min-h-7" : "my-0.5"
      )}
    >
      {/* Timeline rail */}
      <div
        className="relative flex w-4 shrink-0 flex-col items-center"
        aria-hidden
      >
        {position === "middle" || position === "last" ? (
          <span className="absolute top-0 h-[0.7rem] w-px bg-border" />
        ) : null}
        <span
          className={cn(
            "relative z-10 mt-[0.55rem] size-2 shrink-0 rounded-full ring-2 ring-background transition-colors",
            isLoading && "bg-foreground/50",
            isError && "bg-destructive",
            !isLoading &&
              !isError &&
              "bg-muted-foreground/35 group-hover/tool:bg-foreground/70",
            position === "single" && "mt-2"
          )}
        />
        {position === "first" || position === "middle" ? (
          <span className="w-px min-h-[0.75rem] flex-1 bg-border" />
        ) : (
          <span className="flex-1" />
        )}
      </div>

      <div
        className={cn(
          "min-w-0 flex-1 rounded-lg transition-[background-color,box-shadow,padding] duration-200",
          "hover:bg-muted/45 focus-within:bg-muted/45",
          canExpand && "hover:shadow-sm focus-within:shadow-sm",
          position === "single" &&
            "border border-transparent hover:border-border/50 px-1.5"
        )}
      >
        <ToolInvocationRow
          label={label}
          icon={icon}
          isLoading={isLoading}
          isError={isError}
          stepLabel={stepLabel}
          clickable={expandMode === "click" && canExpand}
          expanded={clickExpanded}
          onToggle={() => setClickExpanded((open) => !open)}
        />

        {canExpand ? (
          <div
            className={cn(
              "grid transition-[grid-template-rows,opacity] duration-200 ease-out",
              expandMode === "hover" && [
                "grid-rows-[0fr] opacity-0",
                "group-hover/tool:grid-rows-[1fr] group-hover/tool:opacity-100",
                "group-focus-within/tool:grid-rows-[1fr] group-focus-within/tool:opacity-100",
              ],
              expandMode === "click" &&
                (detailsOpen
                  ? "grid-rows-[1fr] opacity-100"
                  : "grid-rows-[0fr] opacity-0")
            )}
          >
            <div className="min-h-0 overflow-hidden">
              <div
                dir="rtl"
                tabIndex={0}
                className="mb-1.5 max-h-48 overflow-y-auto overscroll-contain rounded-lg border border-border/50 bg-background/60 px-2.5 py-2 text-right text-xs leading-5 text-foreground outline-none"
              >
                {panelTitle ? (
                  <p className="mb-1.5 text-[11px] font-medium text-muted-foreground">
                    {panelTitle}
                  </p>
                ) : null}
                {children}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
