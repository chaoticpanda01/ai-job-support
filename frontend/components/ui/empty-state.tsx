import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * "Nothing here yet", with the way forward. The title is text, not a heading,
 * so an empty list doesn't add a level to the page's outline.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: LucideIcon;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string | undefined;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center rounded-lg border border-dashed bg-card px-6 py-10 text-center",
        className,
      )}
    >
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-secondary text-muted-foreground">
        <Icon aria-hidden="true" className="h-5 w-5" />
      </span>
      <p className="mt-4 font-medium">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-5 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}
