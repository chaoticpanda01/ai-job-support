"use client";

import * as React from "react";
import * as ProgressPrimitive from "@radix-ui/react-progress";
import { cn } from "@/lib/utils";

type ProgressProps = Omit<
  React.ComponentPropsWithoutRef<typeof ProgressPrimitive.Root>,
  "value" | "max"
> & {
  value: number;
  max?: number;
} & ({ "aria-label": string } | { "aria-labelledby": string });

export function Progress({ className, value, max = 100, ...props }: ProgressProps) {
  // Radix logs an error for a value outside 0..max, so clamp before passing it on.
  const clamped = Math.min(Math.max(value, 0), max);
  const percent = max > 0 ? (clamped / max) * 100 : 0;
  return (
    <ProgressPrimitive.Root
      value={clamped}
      max={max}
      className={cn("relative h-1.5 w-full overflow-hidden rounded-full bg-track", className)}
      {...props}
    >
      <ProgressPrimitive.Indicator
        className="h-full bg-indigo transition-[width] motion-reduce:transition-none"
        style={{ width: `${percent}%` }}
      />
    </ProgressPrimitive.Root>
  );
}
