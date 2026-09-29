"use client";

import * as React from "react";
import { X } from "lucide-react";
import { changedCls, controlCls } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * A list of short strings as chips. Enter or a comma adds what's typed
 * (trimmed; blanks and duplicates ignored), Backspace in an empty box removes
 * the last chip, and leaving the box keeps a half-typed entry rather than
 * dropping it. Field's id and aria props, and the forwarded ref, land on the
 * text box, so a form library can focus it (react-hook-form's Controller
 * passes field.ref and field.onBlur).
 */
export interface TagInputProps {
  id?: string;
  value: string[];
  onChange: (next: string[]) => void;
  /** After the box loses focus (and any half-typed tag is committed). */
  onBlur?: () => void;
  placeholder: string;
  /** "Remove {tag}", translated. */
  removeLabel: string;
  changed?: boolean;
  className?: string;
  "aria-label"?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
}

export const TagInput = React.forwardRef<HTMLInputElement, TagInputProps>(function TagInput(
  { id, value, onChange, placeholder, removeLabel, changed = false, className, onBlur, ...aria },
  ref,
) {
  const [draft, setDraft] = React.useState("");
  const inputRef = React.useRef<HTMLInputElement>(null);
  React.useImperativeHandle(ref, () => inputRef.current as HTMLInputElement);

  function withAdded(list: string[], text: string): string[] {
    const tag = text.trim();
    return tag && !list.includes(tag) ? [...list, tag] : list;
  }

  function commit(text: string) {
    const next = withAdded(value, text);
    if (next !== value) onChange(next);
    setDraft("");
  }

  return (
    <div
      className={cn(
        controlCls,
        "flex flex-wrap items-center gap-1.5 py-1.5 focus-within:ring-2 focus-within:ring-ring",
        changed && changedCls,
        className,
      )}
    >
      {value.map((tag) => (
        <span
          key={tag}
          className="inline-flex items-center gap-1 rounded-full bg-secondary py-0.5 pl-2.5 pr-1 text-xs font-medium text-secondary-foreground"
        >
          {tag}
          <button
            type="button"
            aria-label={removeLabel.replace("{tag}", tag)}
            onClick={() => {
              onChange(value.filter((t) => t !== tag));
              // The button leaves with its tag; without this focus drops to <body>.
              inputRef.current?.focus();
            }}
            className="rounded-full p-0.5 hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X aria-hidden="true" className="h-3 w-3" />
          </button>
        </span>
      ))}
      <input
        ref={inputRef}
        id={id}
        {...aria}
        value={draft}
        placeholder={placeholder}
        onChange={(event) => {
          const text = event.target.value;
          if (!text.includes(",")) {
            setDraft(text);
            return;
          }
          const parts = text.split(",");
          const rest = parts.pop() ?? "";
          const next = parts.reduce(withAdded, value);
          if (next !== value) onChange(next);
          setDraft(rest);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            // Inside the settings form, Enter would otherwise submit it.
            event.preventDefault();
            commit(draft);
          } else if (event.key === "Backspace" && draft === "" && value.length > 0) {
            onChange(value.slice(0, -1));
          }
        }}
        onBlur={() => {
          if (draft.trim()) commit(draft);
          onBlur?.();
        }}
        className="min-w-24 flex-1 bg-transparent py-0.5 text-sm outline-none placeholder:text-muted-foreground"
      />
    </div>
  );
});
