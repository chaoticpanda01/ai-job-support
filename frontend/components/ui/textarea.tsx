import * as React from "react";
import { changedCls, controlCls } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  changed?: boolean;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, changed = false, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(controlCls, "min-h-20", changed && changedCls, className)}
      {...props}
    />
  ),
);
Textarea.displayName = "Textarea";
