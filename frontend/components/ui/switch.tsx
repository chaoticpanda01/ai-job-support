"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * An on/off switch: a button with role="switch", so Space and Enter toggle it,
 * named by its visible label. There's no Radix switch package in this repo.
 */
export function Switch({
  checked,
  onCheckedChange,
  label,
  id: idProp,
  describedBy,
  className,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: React.ReactNode;
  id?: string;
  /** The id of a line that explains the switch, read after its name. */
  describedBy?: string | undefined;
  className?: string;
}) {
  const generated = React.useId();
  const id = idProp ?? generated;
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-describedby={describedBy}
        onClick={() => onCheckedChange(!checked)}
        className={cn(
          "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 motion-reduce:transition-none",
          // The off track is muted-foreground, not border grey: a control's
          // state must be visible at 3:1 (WCAG 1.4.11).
          checked ? "bg-indigo" : "bg-muted-foreground",
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            "inline-block h-4 w-4 rounded-full bg-white shadow transition-transform motion-reduce:transition-none",
            checked ? "translate-x-[18px]" : "translate-x-0.5",
          )}
        />
      </button>
      <label htmlFor={id} className="cursor-pointer text-sm font-medium">
        {label}
      </label>
    </div>
  );
}
