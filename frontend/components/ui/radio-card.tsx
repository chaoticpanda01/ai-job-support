import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * One choice in a list of rich options (a resume, an interview type): a
 * native radio in a card, named by the card's content. Put a group of them in
 * a <fieldset> with a <legend>.
 */
export function RadioCard({
  name,
  value,
  checked,
  onChange,
  children,
  className,
}: {
  name: string;
  value: string;
  checked: boolean;
  onChange: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-start gap-3 rounded-lg border bg-card p-4 transition-colors hover:bg-secondary has-[:checked]:border-primary has-[:checked]:bg-secondary motion-reduce:transition-none",
        className,
      )}
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={onChange}
        className="mt-0.5 h-4 w-4 shrink-0 accent-primary"
      />
      <div className="min-w-0 flex-1">{children}</div>
    </label>
  );
}
