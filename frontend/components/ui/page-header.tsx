import * as React from "react";
import { cn } from "@/lib/utils";

interface PageHeaderProps {
  title: React.ReactNode;
  /** The journey stage, e.g. "Prepare". */
  eyebrow?: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  /** Extra content under the description, such as a progress bar. */
  children?: React.ReactNode;
  className?: string;
}

/**
 * The page's title block. The title is the page's only <h1>, so every page
 * keeps a single top-level heading that tests and screen readers can find.
 */
export function PageHeader({
  title,
  eyebrow,
  description,
  actions,
  children,
  className,
}: PageHeaderProps) {
  return (
    <header
      className={cn(
        "mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between",
        className,
      )}
    >
      <div className="min-w-0 space-y-1">
        {eyebrow && (
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-seal">
            {eyebrow}
          </p>
        )}
        <h1 className="font-display text-2xl font-bold leading-tight sm:text-[28px]">{title}</h1>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
        {children}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
    </header>
  );
}
