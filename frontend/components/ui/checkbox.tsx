import * as React from "react";
import { cn } from "@/lib/utils";

/** A native checkbox in the app's colour. Label it with a <label> or aria-*. */
export const Checkbox = React.forwardRef<
  HTMLInputElement,
  Omit<React.InputHTMLAttributes<HTMLInputElement>, "type">
>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    type="checkbox"
    className={cn(
      "h-4 w-4 shrink-0 cursor-pointer accent-primary disabled:cursor-not-allowed disabled:opacity-60",
      className,
    )}
    {...props}
  />
));
Checkbox.displayName = "Checkbox";
