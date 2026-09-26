import * as React from "react";
import { cn } from "@/lib/utils";

/** The shared look of every text-like control. */
export const controlCls =
  "w-full rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60 read-only:bg-secondary read-only:text-secondary-foreground aria-[invalid=true]:border-destructive";

/** An edited, unsaved value. The save bar's count says the same in words. */
export const changedCls = "border-indigo ring-1 ring-indigo";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  changed?: boolean;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, changed = false, ...props }, ref) => (
    <input ref={ref} className={cn(controlCls, changed && changedCls, className)} {...props} />
  ),
);
Input.displayName = "Input";
