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
      {/*
        Stacked on phones, equal columns from sm up. Free-width segments wrapped
        into a ragged box when the labels were long (Indonesian, or lg with the
        menu beside the cards); in a grid a long label wraps inside its own cell.
        Keyboard focus rings the whole control, outside it: Tab lands on the
        checked segment, which is near-black, and a ring inside it can't be seen.
      */}
      <div className="grid divide-y divide-input overflow-hidden rounded-md border border-input bg-card has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-2 has-[:focus-visible]:ring-offset-card sm:auto-cols-fr sm:grid-flow-col sm:divide-x sm:divide-y-0">
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
                "flex h-full cursor-pointer items-center px-3 py-2 text-sm text-secondary-foreground transition-colors hover:bg-secondary motion-reduce:transition-none sm:justify-center sm:text-center",
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
