import * as React from "react";
import { changedCls, controlCls } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  changed?: boolean;
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, changed = false, ...props }, ref) => (
    <select ref={ref} className={cn(controlCls, changed && changedCls, className)} {...props} />
  ),
);
Select.displayName = "Select";
