import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

type SidebarSectionProps = {
  title: string;
  count?: number;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
};

export function SidebarSection({
  title,
  count,
  action,
  children,
  className,
}: SidebarSectionProps) {
  return (
    <section className={cn("px-2 py-2", className)}>
      <div className="mb-1 flex h-7 items-center justify-between gap-2 px-1">
        <h3 className="text-[11px] font-semibold tracking-wide text-muted-foreground">
          {title}
          {count !== undefined && count > 0 ? (
            <span className="ms-1.5 font-normal tabular-nums opacity-70">
              {count}
            </span>
          ) : null}
        </h3>
        {action}
      </div>
      {children}
    </section>
  );
}
