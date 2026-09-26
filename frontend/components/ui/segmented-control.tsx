import * as React from "react";
import { cn } from "@/lib/utils";

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
}

/**
 * One choice from a few, shown as segments. Underneath it is a real radio
 * group (fieldset, legend, native radios), so arrow keys and screen readers
 * work as they do for any radio group.
 */
export function SegmentedControl<T extends string>({
  legend,
  name,
  value,
  options,
  onChange,
  className,
}: {
  legend: React.ReactNode;
  name: string;
  value: T;
  options: SegmentOption<T>[];
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <fieldset className={className}>
      <legend className="mb-1.5 text-sm font-medium">{legend}</legend>
      <div className="inline-flex flex-wrap overflow-hidden rounded-md border border-input bg-card">
        {options.map((option) => (
          <label key={option.value} className="relative">
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
              className="peer sr-only"
            />
            <span
              className={cn(
                "block cursor-pointer px-3 py-2 text-sm text-secondary-foreground transition-colors hover:bg-secondary motion-reduce:transition-none",
                "peer-checked:bg-primary peer-checked:font-medium peer-checked:text-primary-foreground",
                "peer-focus-visible:ring-2 peer-focus-visible:ring-inset peer-focus-visible:ring-ring",
              )}
            >
              {option.label}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
