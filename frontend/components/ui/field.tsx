"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

type ControlProps = {
  id?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
};

interface FieldProps {
  label: React.ReactNode;
  hint?: React.ReactNode;
  error?: string | undefined;
  /** The translated "Optional" tag, for the few fields a card marks optional. */
  optionalLabel?: string | undefined;
  id?: string;
  className?: string;
  children: React.ReactElement<ControlProps>;
}

/**
 * A labelled control. It hands the control its id, and ties the hint and the
 * error to it (aria-describedby, aria-invalid), so every field is named and
 * explained the same way.
 */
export function Field({
  label,
  hint,
  error,
  optionalLabel,
  id: idProp,
  className,
  children,
}: FieldProps) {
  const generated = React.useId();
  const id = idProp ?? children.props.id ?? generated;
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ");
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={id} className="flex items-baseline gap-2 text-sm font-medium">
        {label}
        {optionalLabel && (
          <span className="text-xs font-normal text-muted-foreground">{optionalLabel}</span>
        )}
      </label>
      {React.cloneElement(children, {
        id,
        ...(error ? { "aria-invalid": true } : {}),
        ...(describedBy ? { "aria-describedby": describedBy } : {}),
      })}
      {hint && (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
