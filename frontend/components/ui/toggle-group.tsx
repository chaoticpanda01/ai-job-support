"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface ToggleOption<T extends string> {
  value: T;
  label: React.ReactNode;
  /** For a label in another language than the page, e.g. 履歴書. */
  lang?: string;
}

/**
 * A row of pressable buttons that filters a list, like the language switcher:
 * a named group, and aria-pressed on each. It reports every click, including
 * on the pressed option, so a caller can treat that as "clear".
 */
export function ToggleGroup<T extends string>({
  label,
  value,
  options,
  onChange,
  className,
}: {
  label: string;
  value: T;
  options: ToggleOption<T>[];
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <div role="group" aria-label={label} className={cn("flex flex-wrap gap-2", className)}>
      {options.map((option) => {
        const pressed = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            lang={option.lang}
            aria-pressed={pressed}
            onClick={() => onChange(option.value)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 motion-reduce:transition-none",
              // Pressed is a solid fill and heavier type, not only a colour.
              pressed
                ? "border-primary bg-primary font-semibold text-primary-foreground"
                : "border-input bg-card font-medium text-secondary-foreground hover:bg-secondary",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
