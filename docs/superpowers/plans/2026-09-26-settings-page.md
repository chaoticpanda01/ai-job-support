# Settings Page Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild `/dashboard/settings` as one form with one save bar, a
sticky section menu over five cards, and the shared form controls, in the
new design.

**Architecture:**

- **Pure logic in `lib/`**:
  - `lib/rirekisho-completeness.ts`: the required-field rules, moved
    unchanged.
  - `lib/settings-form.ts`: profile → values, values → changed fields,
    validation.
- **New primitives in `components/ui/`**: Field, Input, Select, Textarea,
  Switch, SegmentedControl, TagInput.
- **`components/settings/`**: the cards, save bar, section menu and leave
  guard.
- **`app/dashboard/settings/page.tsx`**: shrinks to a header and
  `<SettingsForm />`.

**Tech Stack:** Next.js 15 App Router, React 19, Tailwind 3.4, zod,
TanStack Query (`useMe`, `useUpdateProfile`), Clerk (`useClerk`),
vitest + jsdom + Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-26-settings-page-design.md`

## Global Constraints

- **Commands**: all frontend commands run from `frontend/`. Tests run with
  `npx vitest run <path>`, and the full suite with `npm test`.
- **Gates before every commit**: `npm test`, `npm run lint`,
  `npm run type-check` and `npm run format:check`.
- **No new npm packages.**
- **Strings**: every user-facing string goes through `t()` with en, id and
  ja. Placeholders use `t(...).replace("{x}", value)`.
- **tsconfig**: `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`
  are on, and so is `typedRoutes`.
- **Backend clearing rules**:
  - Text fields clear with `""`.
  - `date_of_birth`, `residence_card_expiration`, `gender` and
    `years_experience` cannot be cleared: an empty date or gender is a 422,
    and an absent number is dropped by `exclude_none`. Emptying one is not
    a change.
- **Colour and theme**: seal is a mark only; text colours pass WCAG AA;
  light only.
- **Never run `npm run build` while the dev server is running.** The user
  signs in themselves.
- **Branch and commits**: work on `ui-foundation-shell-home`. Commit after
  each task, ending with
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Do not push or
  merge unless asked.

## File map

| File | Responsibility |
|---|---|
| `frontend/lib/rirekisho-completeness.ts` | Required-field rules, moved from the page (create) |
| `frontend/lib/settings-form.ts` | `SettingsValues`, `formFromProfile`, `changedFields`, `isChanged`, `settleAfterSave`, `validateSettings` (create) |
| `frontend/components/ui/field.tsx`, `input.tsx`, `select.tsx`, `textarea.tsx`, `switch.tsx`, `segmented-control.tsx`, `tag-input.tsx` | Form primitives (create) |
| `frontend/components/settings/settings-card.tsx` | Card shell with an `h2` and a two-column grid (create) |
| `frontend/components/settings/completeness-banner.tsx` | Banner (create) |
| `frontend/components/settings/profile-card.tsx`, `visa-card.tsx`, `extras-card.tsx`, `career-card.tsx`, `account-card.tsx`, `delete-account-card.tsx` | Cards (create) |
| `frontend/components/settings/save-bar.tsx` | Save bar + `--save-bar-offset` (create) |
| `frontend/components/settings/section-nav.tsx` | Section menu with scroll-spy (create) |
| `frontend/components/settings/use-leave-guard.ts` | `beforeunload` + link interception (create) |
| `frontend/components/settings/settings-form.tsx` | Form state, save, discard (create) |
| `frontend/app/dashboard/settings/page.tsx` | Header + `SettingsForm` (rewrite) |
| `frontend/components/chat-widget.tsx` | Container `bottom` uses `--save-bar-offset` (modify) |
| `frontend/lib/i18n.ts` | `settings` strings (modify) |
| `frontend/tests/invariants.test.ts` | Reads the new module (modify) |
| `frontend/tests/lib/settings-form.test.ts`, `frontend/tests/components/form-controls.test.tsx` | (create) |
| `frontend/tests/app/settings.test.tsx` | (rewrite) |

---

### Task 1: Move the required-field rules into `lib/rirekisho-completeness.ts`

A pure move: the page's behaviour doesn't change. Only the type of
`isFieldMissing`'s `form` parameter widens to a structural
`CompletenessFields`, which today's `ProfileUpdateRequest` and later
`SettingsValues` both satisfy.

**Files:**
- Create: `frontend/lib/rirekisho-completeness.ts`
- Modify: `frontend/app/dashboard/settings/page.tsx` (delete lines 49–158:
  `REQUIRED_FIELD_LABEL_KEYS` through `computeMissingRirekishoFields`, and
  import them instead)
- Modify: `frontend/tests/invariants.test.ts` (read the new file)

**Interfaces:**
- **Produces** (all exported):
  - `REQUIRED_FIELD_LABEL_KEYS`
  - `missingFieldLabel(key, lang)`
  - `BASE_REQUIRED_KEYS` and `VISA_HELD_REQUIRED_KEYS`
  - `applicableRequiredKeys(visaStatus)` and `totalRequiredCount(visaStatus)`
  - `isDateOfBirthMissing(dob)`
  - `interface CompletenessFields`
  - `isFieldMissing(key, form: CompletenessFields)`
  - `computeMissingRirekishoFields(form: CompletenessFields, visaStatus)`
  - `fieldId(key): string` (returns `"rirekisho-field-" + key`)

- [ ] **Step 1: Point the invariants test at the new file (it fails first)**

In `tests/invariants.test.ts`, inside `describe("the rirekisho required
fields match the backend")`, make two changes:

1. Change
   `const page = readFileSync(join(FRONTEND, "app/dashboard/settings/page.tsx"), "utf8");`
   to
   `const page = readFileSync(join(FRONTEND, "lib/rirekisho-completeness.ts"), "utf8");`
2. Change the `isFieldMissing` opener string to
   `"function isFieldMissing(key: string, form: CompletenessFields): boolean {"`.

Also update the describe's comment, "The page says in so many words…", to
"lib/rirekisho-completeness.ts says in so many words…".

Run: `cd frontend && npx vitest run tests/invariants.test.ts`

Expected: FAIL. The file doesn't exist (`ENOENT`).

- [ ] **Step 2: Create `lib/rirekisho-completeness.ts`**

Cut these declarations from `app/dashboard/settings/page.tsx` **with their
comments, text unchanged**:

- `REQUIRED_FIELD_LABEL_KEYS`
- `missingFieldLabel`
- `BASE_REQUIRED_KEYS` and `VISA_HELD_REQUIRED_KEYS`
- `applicableRequiredKeys` and `totalRequiredCount`
- `isDateOfBirthMissing` and `isFieldMissing`
- `computeMissingRirekishoFields`

Paste them into the new file, then:

- Add `export` to each.
- Replace `ProfileUpdateRequest` in `isFieldMissing` and
  `computeMissingRirekishoFields` with `CompletenessFields`.
- Add the header, the interface and `fieldId` shown below. The comment on
  `computeMissingRirekishoFields` that mentions "the Settings banner" stays
  as it is.

```ts
import { t, type Language } from "@/lib/i18n";
import type { VisaStatus } from "@/types/api";

/**
 * Which of the fields a 履歴書 needs are still missing: a deliberate, bounded
 * copy of rirekisho_missing_fields() (backend/app/services/
 * rirekisho_completeness.py), so the Settings banner can update as the user
 * types. tests/invariants.test.ts checks this file against the backend.
 */

/** The fields the rules read. Empty strings count as missing, like undefined. */
export interface CompletenessFields {
  full_name?: string | undefined;
  name_kana?: string | undefined;
  date_of_birth?: string | undefined;
  gender?: string | undefined;
  phone_number?: string | undefined;
  mailing_address?: string | undefined;
  visa_category?: string | undefined;
  residence_card_expiration?: string | undefined;
}

/** The id each required field's input carries, so the banner can focus it. */
export function fieldId(key: string): string {
  return `rirekisho-field-${key}`;
}
```

In `app/dashboard/settings/page.tsx`, add:

```ts
import {
  computeMissingRirekishoFields,
  missingFieldLabel,
  totalRequiredCount,
} from "@/lib/rirekisho-completeness";
```

Then delete any imports that are now unused. Leave the rest of the page
alone.

- [ ] **Step 3: Run the tests**

Run: `cd frontend && npx vitest run tests/invariants.test.ts tests/app/settings.test.tsx`

Expected: PASS. The invariants read the new file, and the page behaves as
before (37 tests).

- [ ] **Step 4: Prove the invariants still bite**

In `lib/rirekisho-completeness.ts`, temporarily delete the
`    case "gender":` arm and its return from `isFieldMissing`. Then run
`npx vitest run tests/invariants.test.ts`: "decides every required field
in isFieldMissing" must FAIL. Restore the arm and re-run: PASS.

- [ ] **Step 5: Gates and commit**

```bash
cd frontend && npm test && npm run lint && npm run type-check && npm run format:check
git add lib/rirekisho-completeness.ts app/dashboard/settings/page.tsx tests/invariants.test.ts
git commit -m "refactor(settings): move the 履歴書 required-field rules into lib

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Form primitives

**Files:**
- Create: `frontend/components/ui/input.tsx`, `select.tsx`, `textarea.tsx`,
  `field.tsx`, `switch.tsx`, `segmented-control.tsx`, `tag-input.tsx`
- Test: `frontend/tests/components/form-controls.test.tsx`

**Interfaces:**
- **Produces:**
  - `controlCls: string` and `changedCls: string` (from `input.tsx`)
  - `Input(props & { changed?: boolean })`, `Select(...)` and
    `Textarea(...)`, all forwarding refs
  - `Field({ label, hint?, error?, optionalLabel?, id?, className?, children })`
  - `Switch({ checked, onCheckedChange, label, id?, className? })`
  - `SegmentedControl<T extends string>({ legend, name, value, options, onChange, className? })`
  - `TagInput({ id?, value, onChange, placeholder, removeLabel, changed?, className?, "aria-describedby"?, "aria-invalid"? })`

- [ ] **Step 1: Write the failing tests**

Create `frontend/tests/components/form-controls.test.tsx`:

```tsx
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Switch } from "@/components/ui/switch";
import { TagInput } from "@/components/ui/tag-input";

describe("Field", () => {
  it("names its control and ties the hint and error to it", () => {
    render(
      <Field label="Phone" hint="With the area code" error="Too short">
        <Input />
      </Field>,
    );
    const input = screen.getByRole("textbox", { name: "Phone" });
    expect(input).toHaveAccessibleDescription("With the area code Too short");
    expect(input).toHaveAttribute("aria-invalid", "true");
  });

  it("is valid, and says Optional only when told", () => {
    render(
      <Field label="Hobbies" optionalLabel="Optional">
        <Input />
      </Field>,
    );
    expect(screen.getByText("Optional")).toBeInTheDocument();
    expect(screen.getByRole("textbox")).not.toHaveAttribute("aria-invalid");
  });

  it("keeps an id the control already has", () => {
    render(
      <Field label="Phone">
        <Input id="rirekisho-field-phone_number" />
      </Field>,
    );
    expect(screen.getByRole("textbox", { name: "Phone" })).toHaveAttribute(
      "id",
      "rirekisho-field-phone_number",
    );
  });
});

describe("Input", () => {
  it("marks an unsaved change", () => {
    render(<Input aria-label="Name" changed />);
    expect(screen.getByRole("textbox", { name: "Name" }).className).toContain("border-indigo");
  });
});

describe("Switch", () => {
  function Harness() {
    const [on, setOn] = useState(false);
    return <Switch checked={on} onCheckedChange={setOn} label="Show commute time" />;
  }

  it("is a named switch that toggles on click", () => {
    render(<Harness />);
    const toggle = screen.getByRole("switch", { name: "Show commute time" });
    expect(toggle).toHaveAttribute("aria-checked", "false");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-checked", "true");
  });

  it("toggles from its visible label too", () => {
    render(<Harness />);
    fireEvent.click(screen.getByText("Show commute time"));
    expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "true");
  });
});

describe("SegmentedControl", () => {
  function Harness() {
    const [value, setValue] = useState<"none" | "held">("none");
    return (
      <SegmentedControl
        legend="Current visa status"
        name="visa_status"
        value={value}
        options={[
          { value: "none", label: "No visa" },
          { value: "held", label: "Currently held" },
        ]}
        onChange={setValue}
      />
    );
  }

  it("is a radio group named by its legend", () => {
    render(<Harness />);
    const group = screen.getByRole("group", { name: "Current visa status" });
    expect(within(group).getByRole("radio", { name: "No visa" })).toBeChecked();
    fireEvent.click(within(group).getByRole("radio", { name: "Currently held" }));
    expect(within(group).getByRole("radio", { name: "Currently held" })).toBeChecked();
  });
});

describe("TagInput", () => {
  function Harness({ initial = [] as string[] }) {
    const [tags, setTags] = useState(initial);
    return (
      <>
        <TagInput
          aria-label="Target roles"
          value={tags}
          onChange={setTags}
          placeholder="Add a role…"
          removeLabel="Remove {tag}"
        />
        <output>{tags.join("|")}</output>
      </>
    );
  }
  const box = () => screen.getByRole("textbox", { name: "Target roles" });
  const tags = () => screen.getByRole("status").textContent;

  it("adds on Enter, trimmed, without submitting a form", () => {
    let submitted = false;
    render(
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submitted = true;
        }}
      >
        <Harness />
      </form>,
    );
    fireEvent.change(box(), { target: { value: "  Backend Engineer " } });
    fireEvent.keyDown(box(), { key: "Enter" });
    expect(tags()).toBe("Backend Engineer");
    expect(submitted).toBe(false);
  });

  it("adds on a comma, keeping what follows it", () => {
    render(<Harness />);
    fireEvent.change(box(), { target: { value: "SRE, Data" } });
    expect(tags()).toBe("SRE");
    expect(box()).toHaveValue(" Data");
  });

  it("ignores blanks and duplicates", () => {
    render(<Harness initial={["SRE"]} />);
    fireEvent.change(box(), { target: { value: "SRE" } });
    fireEvent.keyDown(box(), { key: "Enter" });
    fireEvent.change(box(), { target: { value: "   " } });
    fireEvent.keyDown(box(), { key: "Enter" });
    expect(tags()).toBe("SRE");
  });

  it("removes the last tag on Backspace in an empty box", () => {
    render(<Harness initial={["SRE", "Data"]} />);
    fireEvent.keyDown(box(), { key: "Backspace" });
    expect(tags()).toBe("SRE");
  });

  it("removes a tag from its named button", () => {
    render(<Harness initial={["SRE", "Data"]} />);
    fireEvent.click(screen.getByRole("button", { name: "Remove SRE" }));
    expect(tags()).toBe("Data");
  });

  it("keeps a half-typed tag when the box loses focus", () => {
    render(<Harness />);
    fireEvent.change(box(), { target: { value: "QA" } });
    fireEvent.blur(box());
    expect(tags()).toBe("QA");
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd frontend && npx vitest run tests/components/form-controls.test.tsx`

Expected: FAIL, "Failed to resolve import `@/components/ui/field`".

- [ ] **Step 3: Implement the primitives**

`frontend/components/ui/input.tsx`:

```tsx
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
```

`frontend/components/ui/select.tsx`:

```tsx
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
```

`frontend/components/ui/textarea.tsx`:

```tsx
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
```

`frontend/components/ui/field.tsx`:

```tsx
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
```

`frontend/components/ui/switch.tsx`:

```tsx
"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * An on/off switch: a button with role="switch", so Space and Enter toggle it,
 * named by its visible label. There's no Radix switch package in this repo.
 */
export function Switch({
  checked,
  onCheckedChange,
  label,
  id: idProp,
  className,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: React.ReactNode;
  id?: string;
  className?: string;
}) {
  const generated = React.useId();
  const id = idProp ?? generated;
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onCheckedChange(!checked)}
        className={cn(
          "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 motion-reduce:transition-none",
          // The off track is muted-foreground, not border grey: a control's
          // state must be visible at 3:1 (WCAG 1.4.11).
          checked ? "bg-indigo" : "bg-muted-foreground",
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            "inline-block h-4 w-4 rounded-full bg-white shadow transition-transform motion-reduce:transition-none",
            checked ? "translate-x-[18px]" : "translate-x-0.5",
          )}
        />
      </button>
      <label htmlFor={id} className="cursor-pointer text-sm font-medium">
        {label}
      </label>
    </div>
  );
}
```

`frontend/components/ui/segmented-control.tsx`:

```tsx
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
```

`frontend/components/ui/tag-input.tsx`:

```tsx
"use client";

import * as React from "react";
import { X } from "lucide-react";
import { changedCls, controlCls } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * A list of short strings as chips. Enter or a comma adds what's typed
 * (trimmed; blanks and duplicates ignored), Backspace in an empty box removes
 * the last chip, and leaving the box keeps a half-typed entry rather than
 * dropping it. Field's id and aria props land on the text box.
 */
export function TagInput({
  id,
  value,
  onChange,
  placeholder,
  removeLabel,
  changed = false,
  className,
  ...aria
}: {
  id?: string;
  value: string[];
  onChange: (next: string[]) => void;
  placeholder: string;
  /** "Remove {tag}", translated. */
  removeLabel: string;
  changed?: boolean;
  className?: string;
  "aria-label"?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
}) {
  const [draft, setDraft] = React.useState("");

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
            onClick={() => onChange(value.filter((t) => t !== tag))}
            className="rounded-full p-0.5 hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X aria-hidden="true" className="h-3 w-3" />
          </button>
        </span>
      ))}
      <input
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
        }}
        className="min-w-24 flex-1 bg-transparent py-0.5 text-sm outline-none placeholder:text-muted-foreground"
      />
    </div>
  );
}
```

- [ ] **Step 4: Run the tests**

Run: `cd frontend && npx vitest run tests/components/form-controls.test.tsx`

Expected: PASS, 13 tests.

- [ ] **Step 5: Gates and commit**

```bash
cd frontend && npm test && npm run lint && npm run type-check && npm run format:check
git add components/ui/input.tsx components/ui/select.tsx components/ui/textarea.tsx components/ui/field.tsx components/ui/switch.tsx components/ui/segmented-control.tsx components/ui/tag-input.tsx tests/components/form-controls.test.tsx
git commit -m "feat(ui): form controls: Field, Input, Select, Textarea, Switch, SegmentedControl, TagInput

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: The settings form model (`lib/settings-form.ts`)

**Files:**
- Create: `frontend/lib/settings-form.ts`
- Test: `frontend/tests/lib/settings-form.test.ts`

**Interfaces:**
- **Consumes:** `MeResponse`, `ProfileUpdateRequest`, `Gender`,
  `JapaneseLevel` and `VisaStatus` from `@/types/api`; `t` and `Language`.
- **Produces:**
  - `interface SettingsValues` (every field the form edits; empty text is
    `""`; `years_experience` is the input's string)
  - `type SettingsErrors = Partial<Record<keyof SettingsValues, string>>`
  - `DEFAULT_PERSONAL_REQUESTS = "貴社の規定に従います。"`
  - `formFromProfile(me: MeResponse): SettingsValues`
  - `isChanged(saved, values, key): boolean`
  - `changedFields(saved, values): ProfileUpdateRequest`
  - `settleAfterSave(saved, values): SettingsValues`
  - `validateSettings(values, lang): SettingsErrors`

- [ ] **Step 1: Add the one string it needs**

In `lib/i18n.ts`'s `settings` section, add:

```ts
    yearsRange: {
      en: "Enter a number from 0 to 80",
      id: "Masukkan angka 0 sampai 80",
      ja: "0〜80の数字を入力してください",
    },
```

- [ ] **Step 2: Write the failing tests**

Create `frontend/tests/lib/settings-form.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  DEFAULT_PERSONAL_REQUESTS,
  changedFields,
  formFromProfile,
  isChanged,
  settleAfterSave,
  validateSettings,
} from "@/lib/settings-form";
import { t } from "@/lib/i18n";
import type { MeResponse, Profile } from "@/types/api";

const PROFILE = {
  nationality: "Indonesian",
  japanese_level: "N2",
  target_industry: ["IT"],
  target_role: ["SRE"],
  years_experience: 5,
  visa_status: "none",
  name_kana: "ヤマダ タロウ",
  date_of_birth: "1995-04-15",
  gender: "male",
  phone_number: "090",
  mailing_address: "Tokyo",
  residence_card_expiration: null,
  visa_category: null,
  hobbies: null,
  special_skills: null,
  personal_requests: null,
  commute_time: null,
  dependents: null,
} as unknown as Profile;

const me = (profile: Partial<Profile> | null = {}, full_name: string | null = "山田 太郎") =>
  ({
    user: { full_name, email: "a@example.test" },
    profile: profile === null ? null : { ...PROFILE, ...profile },
  }) as MeResponse;

describe("formFromProfile", () => {
  it("fills every field, with empty text as an empty string", () => {
    const values = formFromProfile(me());
    expect(values).toMatchObject({
      full_name: "山田 太郎",
      name_kana: "ヤマダ タロウ",
      gender: "male",
      visa_status: "none",
      visa_category: "",
      residence_card_expiration: "",
      years_experience: "5",
      target_role: ["SRE"],
    });
  });

  it("offers the standard request phrase when none was saved", () => {
    expect(formFromProfile(me()).personal_requests).toBe(DEFAULT_PERSONAL_REQUESTS);
  });

  it("copes with a user who has no profile yet", () => {
    const values = formFromProfile(me(null, null));
    expect(values).toMatchObject({ full_name: "", visa_status: "none", japanese_level: "none" });
  });
});

describe("changedFields", () => {
  const saved = formFromProfile(me());

  it("is empty until something is edited", () => {
    expect(changedFields(saved, { ...saved })).toEqual({});
  });

  it("holds only what was edited", () => {
    expect(changedFields(saved, { ...saved, phone_number: "080" })).toEqual({
      phone_number: "080",
    });
  });

  it("sends a cleared text field as an empty string, which clears it", () => {
    expect(changedFields(saved, { ...saved, mailing_address: "" })).toEqual({
      mailing_address: "",
    });
  });

  it("does not count emptying a field the backend can't clear", () => {
    // An empty date or gender is a 422; an absent number is dropped.
    const emptied = { ...saved, date_of_birth: "", gender: "" as const, years_experience: "" };
    expect(changedFields(saved, emptied)).toEqual({});
  });

  it("sends years of experience as a number", () => {
    expect(changedFields(saved, { ...saved, years_experience: "8" })).toEqual({
      years_experience: 8,
    });
  });

  it("compares lists by content, in order", () => {
    expect(changedFields(saved, { ...saved, target_role: ["SRE"] })).toEqual({});
    expect(changedFields(saved, { ...saved, target_role: ["SRE", "QA"] })).toEqual({
      target_role: ["SRE", "QA"],
    });
  });

  it("forgets an edit that was put back", () => {
    expect(changedFields(saved, { ...saved, phone_number: "090" })).toEqual({});
  });
});

describe("isChanged", () => {
  const saved = formFromProfile(me());
  it("says which fields differ", () => {
    const values = { ...saved, hobbies: "Hiking" };
    expect(isChanged(saved, values, "hobbies")).toBe(true);
    expect(isChanged(saved, values, "phone_number")).toBe(false);
  });
});

describe("settleAfterSave", () => {
  it("puts back a field that couldn't be cleared, since it wasn't", () => {
    const saved = formFromProfile(me());
    const values = { ...saved, date_of_birth: "", phone_number: "080" };
    expect(settleAfterSave(saved, values)).toEqual({
      ...saved,
      phone_number: "080",
    });
  });
});

describe("validateSettings", () => {
  const saved = formFromProfile(me());

  it.each(["-1", "81", "2.5"])("refuses %s years of experience", (years) => {
    expect(validateSettings({ ...saved, years_experience: years }, "en")).toEqual({
      years_experience: t("settings", "yearsRange", "en"),
    });
  });

  it.each(["", "0", "80"])("accepts %s", (years) => {
    expect(validateSettings({ ...saved, years_experience: years }, "en")).toEqual({});
  });
});
```

- [ ] **Step 3: Run them to verify they fail**

Run: `cd frontend && npx vitest run tests/lib/settings-form.test.ts`

Expected: FAIL, "Failed to resolve import `@/lib/settings-form`".

- [ ] **Step 4: Implement `frontend/lib/settings-form.ts`**

```ts
import { z } from "zod";
import { t, type Language } from "@/lib/i18n";
import type {
  Gender,
  JapaneseLevel,
  MeResponse,
  ProfileUpdateRequest,
  VisaStatus,
} from "@/types/api";

/**
 * Every value the Settings form edits, as its controls hold them: empty text
 * is "" (not undefined), and years of experience is the number input's
 * string. Email, the photo and the app language are not here: they are
 * read-only or save on their own.
 */
export interface SettingsValues {
  full_name: string;
  name_kana: string;
  date_of_birth: string;
  gender: Gender | "";
  nationality: string;
  phone_number: string;
  mailing_address: string;
  visa_status: VisaStatus;
  visa_category: string;
  residence_card_expiration: string;
  hobbies: string;
  special_skills: string;
  commute_time: string;
  dependents: string;
  personal_requests: string;
  japanese_level: JapaneseLevel;
  years_experience: string;
  target_role: string[];
  target_industry: string[];
}

export type SettingsErrors = Partial<Record<keyof SettingsValues, string>>;

/** "I will follow your company's rules": what a 履歴書 says when there's no request. */
export const DEFAULT_PERSONAL_REQUESTS = "貴社の規定に従います。";

/**
 * Fields the backend can't set to empty: an empty date or gender fails
 * validation (422), and an absent number is dropped by exclude_none. Emptying
 * one is therefore not a change, rather than an edit that could never save.
 */
const NOT_CLEARABLE = new Set<keyof SettingsValues>([
  "date_of_birth",
  "residence_card_expiration",
  "gender",
  "years_experience",
]);

export function formFromProfile(me: MeResponse): SettingsValues {
  const p = me.profile;
  return {
    full_name: me.user.full_name ?? "",
    name_kana: p?.name_kana ?? "",
    date_of_birth: p?.date_of_birth ?? "",
    gender: p?.gender ?? "",
    nationality: p?.nationality ?? "",
    phone_number: p?.phone_number ?? "",
    mailing_address: p?.mailing_address ?? "",
    visa_status: p?.visa_status ?? "none",
    visa_category: p?.visa_category ?? "",
    residence_card_expiration: p?.residence_card_expiration ?? "",
    hobbies: p?.hobbies ?? "",
    special_skills: p?.special_skills ?? "",
    commute_time: p?.commute_time ?? "",
    dependents: p?.dependents ?? "",
    personal_requests: p?.personal_requests ?? DEFAULT_PERSONAL_REQUESTS,
    japanese_level: p?.japanese_level ?? "none",
    years_experience:
      p?.years_experience === null || p?.years_experience === undefined
        ? ""
        : String(p.years_experience),
    target_role: [...(p?.target_role ?? [])],
    target_industry: [...(p?.target_industry ?? [])],
  };
}

function same(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, i) => item === b[i]);
  }
  return a === b;
}

export function isChanged(
  saved: SettingsValues,
  values: SettingsValues,
  key: keyof SettingsValues,
): boolean {
  return !same(saved[key], values[key]);
}

/**
 * The update to send: only the fields that differ from what's saved and that
 * the backend can actually take (see NOT_CLEARABLE). Its size is the save
 * bar's "N unsaved changes".
 */
export function changedFields(saved: SettingsValues, values: SettingsValues): ProfileUpdateRequest {
  const update: Record<string, unknown> = {};
  for (const key of Object.keys(values) as (keyof SettingsValues)[]) {
    const value = values[key];
    if (same(saved[key], value)) continue;
    if (value === "" && NOT_CLEARABLE.has(key)) continue;
    update[key] = key === "years_experience" ? Number(value) : value;
  }
  return update as ProfileUpdateRequest;
}

/**
 * What the form holds after a successful save: what was sent, plus the saved
 * value back in any field whose emptying wasn't sent, so the screen shows
 * what's actually stored.
 */
export function settleAfterSave(saved: SettingsValues, values: SettingsValues): SettingsValues {
  const settled = { ...values };
  for (const key of NOT_CLEARABLE) {
    if (values[key] === "") (settled as Record<string, unknown>)[key] = saved[key];
  }
  return settled;
}

const yearsSchema = z.coerce.number().int().min(0).max(80);

/** Errors to show before sending. Missing 履歴書 fields never block a save. */
export function validateSettings(values: SettingsValues, lang: Language): SettingsErrors {
  if (values.years_experience !== "" && !yearsSchema.safeParse(values.years_experience).success) {
    return { years_experience: t("settings", "yearsRange", lang) };
  }
  return {};
}
```

- [ ] **Step 5: Run the tests**

Run: `cd frontend && npx vitest run tests/lib/settings-form.test.ts`

Expected: PASS, 18 tests.

- [ ] **Step 6: Gates and commit**

```bash
cd frontend && npm test && npm run lint && npm run type-check && npm run format:check
git add lib/settings-form.ts lib/i18n.ts tests/lib/settings-form.test.ts
git commit -m "feat(settings): form model that knows what changed and what can be sent

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: The one-form Settings page

**Files:**
- Modify: `frontend/lib/i18n.ts` (`settings` strings)
- Create: `frontend/components/settings/settings-card.tsx`,
  `completeness-banner.tsx`, `profile-card.tsx`, `visa-card.tsx`,
  `extras-card.tsx`, `career-card.tsx`, `account-card.tsx`,
  `delete-account-card.tsx`, `save-bar.tsx`, `settings-form.tsx`
- Rewrite: `frontend/app/dashboard/settings/page.tsx`
- Modify: `frontend/components/chat-widget.tsx` (container `bottom`)
- Rewrite: `frontend/tests/app/settings.test.tsx`

**Interfaces:**
- **Consumes:**
  - Task 1: `computeMissingRirekishoFields`, `missingFieldLabel` and
    `fieldId`.
  - Task 2: all the primitives.
  - Task 3: `SettingsValues`, `SettingsErrors`, `formFromProfile`,
    `changedFields`, `isChanged`, `settleAfterSave` and `validateSettings`.
  - Existing:
    - `Button` (`loading` is aria-disabled and ignores clicks)
    - `PageHeader`, `Skeleton` and `PhotoUploader`
    - `LanguageSwitcher`
    - `useMe`, `useUpdateProfile` and `useDeleteAccount`
    - `useToast` (`toast({ variant, description })`)
    - `apiErrorMessage(err, lang)`
- **Produces:**
  - `CardProps { values; saved; errors; update; lang }`
  - `SettingsCard({ id, title, description?, children })`
  - `SettingsForm({ me })`
  - `SaveBar({ count, saving, error, onDiscard, lang })`
  - The `--save-bar-offset` CSS variable
  - Task 5 adds `SectionNav` and `useLeaveGuard` to `SettingsForm`.

- [ ] **Step 1: The strings**

In `lib/i18n.ts`, `settings` section:

**Change** the text of `sub`, `photoHint`, `personalRequestsHint` and
`rirekishoReady` to:

```ts
    sub: {
      en: "Your profile, your 履歴書 details and your account.",
      id: "Profil, detail 履歴書, dan akunmu.",
      ja: "プロフィール、履歴書の詳細、アカウントの設定。",
    },
    photoHint: {
      en: "Saves as soon as you upload it.",
      id: "Tersimpan begitu diunggah.",
      ja: "アップロードするとすぐに保存されます。",
    },
    personalRequestsHint: {
      en: "The standard phrase: “I will follow your company's rules.” Change it only for a specific request.",
      id: "Kalimat standar: “Saya akan mengikuti peraturan perusahaan.” Ubah hanya jika ada permintaan khusus.",
      ja: "定型文です。特別な希望がある場合のみ変更してください。",
    },
    rirekishoReady: {
      en: "Your 履歴書 has everything it needs",
      id: "履歴書-mu sudah lengkap",
      ja: "履歴書に必要な項目はすべて入力済みです",
    },
```

**Add**:

```ts
    sectionVisa: { en: "Visa & residence", id: "Visa & izin tinggal", ja: "ビザ・在留" },
    sectionExtras: { en: "履歴書 extras", id: "Tambahan 履歴書", ja: "履歴書の追加項目" },
    sectionCareer: { en: "Career", id: "Karier", ja: "キャリア" },
    sectionAccount: { en: "Account", id: "Akun", ja: "アカウント" },
    sectionsNav: { en: "Settings sections", id: "Bagian pengaturan", ja: "設定のセクション" },
    profileDesc: {
      en: "Printed at the top of your 履歴書.",
      id: "Dicetak di bagian atas 履歴書-mu.",
      ja: "履歴書の上部に記載されます。",
    },
    visaDesc: {
      en: "Category and expiry are needed on your 履歴書 once you hold a visa.",
      id: "Kategori dan masa berlaku diperlukan di 履歴書-mu setelah kamu memiliki visa.",
      ja: "ビザを取得済みの場合、在留資格と在留期限が履歴書に必要です。",
    },
    extrasDesc: {
      en: "All optional. Hobbies and skills fill the 特技・趣味 box (left empty if blank). Commute time and dependents print only on the landscape 履歴書, and only when switched on.",
      id: "Semua opsional. Hobi dan keahlian mengisi kotak 特技・趣味 (kosong jika tidak diisi). Waktu tempuh dan tanggungan hanya dicetak di 履歴書 lanskap, dan hanya jika diaktifkan.",
      ja: "すべて任意です。趣味と特技は「特技・趣味」欄に記載されます（未入力なら空欄）。通勤時間と扶養家族は、オンにした場合のみ横向きの履歴書に記載されます。",
    },
    careerDesc: {
      en: "Optional. Used to tailor your documents and job matches.",
      id: "Opsional. Dipakai untuk menyesuaikan dokumen dan pencocokan lowonganmu.",
      ja: "任意。書類や求人マッチングの調整に使います。",
    },
    optional: { en: "Optional", id: "Opsional", ja: "任意" },
    email: { en: "Email", id: "Email", ja: "メールアドレス" },
    emailHint: {
      en: "From your sign-in. Change it in your account menu.",
      id: "Dari akun masukmu. Ubah lewat menu akun.",
      ja: "ログイン情報のものです。アカウントメニューから変更できます。",
    },
    showCommute: {
      en: "Show commute time (通勤時間)",
      id: "Tampilkan waktu tempuh (通勤時間)",
      ja: "通勤時間を記載する",
    },
    showDependents: {
      en: "Show dependents (扶養家族)",
      id: "Tampilkan tanggungan (扶養家族)",
      ja: "扶養家族を記載する",
    },
    commuteExample: { en: "For example 約45分", id: "Contoh: 約45分", ja: "例：約45分" },
    dependentsExample: { en: "For example 配偶者1名", id: "Contoh: 配偶者1名", ja: "例：配偶者1名" },
    commuteOff: {
      en: "Off: no 通勤時間 box on your landscape 履歴書.",
      id: "Nonaktif: tidak ada kotak 通勤時間 di 履歴書 lanskap.",
      ja: "オフ：横向きの履歴書に通勤時間欄は記載されません。",
    },
    dependentsOff: {
      en: "Off: no 扶養家族 box on your landscape 履歴書.",
      id: "Nonaktif: tidak ada kotak 扶養家族 di 履歴書 lanskap.",
      ja: "オフ：横向きの履歴書に扶養家族欄は記載されません。",
    },
    appLanguage: { en: "App language", id: "Bahasa aplikasi", ja: "表示言語" },
    appLanguageHint: {
      en: "Changes the app straight away; not part of Save.",
      id: "Langsung mengubah aplikasi; tidak termasuk Simpan.",
      ja: "すぐにアプリに反映されます（保存は不要）。",
    },
    addRole: { en: "Add a role…", id: "Tambah posisi…", ja: "職種を追加…" },
    addIndustry: { en: "Add an industry…", id: "Tambah industri…", ja: "業界を追加…" },
    removeTag: { en: "Remove {tag}", id: "Hapus {tag}", ja: "{tag}を削除" },
    rirekishoNeedsOne: {
      en: "Your 履歴書 needs 1 more detail:",
      id: "履歴書-mu masih perlu 1 data lagi:",
      ja: "履歴書にあと1項目必要です：",
    },
    rirekishoNeedsMany: {
      en: "Your 履歴書 needs {n} more details:",
      id: "履歴書-mu masih perlu {n} data lagi:",
      ja: "履歴書にあと{n}項目必要です：",
    },
    unsavedOne: { en: "1 unsaved change", id: "1 perubahan belum disimpan", ja: "未保存の変更が1件あります" },
    unsavedMany: {
      en: "{n} unsaved changes",
      id: "{n} perubahan belum disimpan",
      ja: "未保存の変更が{n}件あります",
    },
    discard: { en: "Discard", id: "Buang", ja: "破棄" },
    leaveTitle: {
      en: "Discard unsaved changes?",
      id: "Buang perubahan yang belum disimpan?",
      ja: "未保存の変更を破棄しますか？",
    },
    keepEditing: { en: "Keep editing", id: "Lanjut mengedit", ja: "編集を続ける" },
```

**Delete**, after running
`grep -rnE 't\("settings", "(required|recommended|preferredLang|rirekishoInfo|rirekishoInfoHint|jobPreferences|jobPreferencesHint|targetRolesHint|targetIndustriesHint|rirekishoMissingCount|dangerZone)"' app components lib | grep -v app/dashboard/settings/page.tsx`
and seeing **no** output:

- `required`, `recommended` and `preferredLang`
- `rirekishoInfo` and `rirekishoInfoHint`
- `jobPreferences` and `jobPreferencesHint`
- `targetRolesHint` and `targetIndustriesHint`
- `rirekishoMissingCount` and `dangerZone`

If a key shows up elsewhere, keep it.

- [ ] **Step 2: Rewrite the page tests (they fail against today's page)**

Replace `frontend/tests/app/settings.test.tsx` with:

```tsx
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, screen, within, type RenderResult } from "@testing-library/react";
import { renderIn } from "../helpers";
import { ApiClientError } from "@/lib/api-client";
import { t } from "@/lib/i18n";
import { SIGN_IN_ROUTE } from "@/lib/routes";
import type { MeResponse, Profile, User, VisaStatus } from "@/types/api";

// jsdom has no layout, so the banner's scroll-into-view would throw.
Element.prototype.scrollIntoView = vi.fn();

const meQuery = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));
const updateProfile = vi.hoisted(() => ({
  current: {} as Record<string, unknown>,
  saves: [] as unknown[],
}));
const deleteAccount = vi.hoisted(() => ({ current: {} as Record<string, unknown>, calls: 0 }));
const session = vi.hoisted(() => ({
  signOuts: 0,
  pushes: [] as string[],
  signOutFails: false,
}));
const toasts = vi.hoisted(() => ({ list: [] as Array<{ description?: string }> }));
const confirm = vi.hoisted(() => ({ calls: 0, answer: true }));

vi.mock("@/hooks/useMe", () => ({
  useMe: () => meQuery.current,
  useUpdateProfile: () => updateProfile.current,
  useUploadPhoto: () => ({}),
}));
vi.mock("@/hooks/useAccount", () => ({ useDeleteAccount: () => deleteAccount.current }));
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: (t: { description?: string }) => toasts.list.push(t) }),
}));
vi.mock("@/components/confirm-dialog-provider", () => ({
  useConfirm: () => () => {
    confirm.calls += 1;
    return Promise.resolve(confirm.answer);
  },
}));
vi.mock("@clerk/nextjs", () => ({
  useClerk: () => ({
    signOut: () => {
      session.signOuts += 1;
      return session.signOutFails ? Promise.reject(new Error("clerk down")) : Promise.resolve();
    },
  }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: (url: string) => session.pushes.push(url) }),
}));
// Pulls in react-dropzone and the photo upload hook, which this page's own
// behaviour doesn't depend on.
vi.mock("@/components/profile/PhotoUploader", () => ({ PhotoUploader: () => null }));

const SettingsPage = (await import("@/app/dashboard/settings/page")).default;

const LANG = "ja";
const s = (key: Parameters<typeof t>[1]) => t("settings", key, LANG);
const common = (key: Parameters<typeof t>[1]) => t("common", key, LANG);

/** A "YYYY-MM-DD" birth date for someone who turns `years` old today, or `plusDays` later. */
function birthDateForAge(years: number, plusDays = 0): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - years);
  d.setDate(d.getDate() + plusDays);
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${month}-${day}`;
}

const COMPLETE_PROFILE: Profile = {
  id: "p1",
  user_id: "u1",
  nationality: "Indonesia",
  japanese_level: "N2",
  target_industry: [],
  target_role: [],
  years_experience: 5,
  current_location: null,
  target_location: null,
  visa_status: "none",
  preferred_language: "ja",
  onboarding_step: 5,
  onboarding_completed: true,
  consent_given_at: "2026-01-01T00:00:00Z",
  name_kana: "やまだ たろう",
  date_of_birth: birthDateForAge(30),
  gender: "male",
  phone_number: "090-0000-0000",
  mailing_address: "東京都渋谷区1-1-1",
  residence_card_expiration: null,
  visa_category: null,
  photo_storage_key: null,
  photo_url: null,
  hobbies: null,
  special_skills: null,
  personal_requests: null,
  commute_time: null,
  dependents: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

const USER: User = {
  id: "u1",
  clerk_id: "user_1",
  email: "taro@example.test",
  email_verified: true,
  full_name: "山田 太郎",
  subscription_tier: "free",
  role: "user",
  is_active: true,
  last_login_at: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  profile: null,
};

function me(profileOver: Partial<Profile> = {}, userOver: Partial<User> = {}): MeResponse {
  const profile = { ...COMPLETE_PROFILE, ...profileOver };
  return {
    user: { ...USER, ...userOver, profile },
    profile,
    rirekisho_ready: true,
    rirekisho_missing_fields: [],
  };
}

async function renderPage(
  data: MeResponse | undefined = me(),
  over: Record<string, unknown> = {},
): Promise<RenderResult> {
  meQuery.current = { data, isLoading: false, error: null, ...over };
  let view: RenderResult | null = null;
  await act(async () => {
    view = renderIn(LANG, <SettingsPage />);
  });
  if (view === null) throw new Error("the page never rendered");
  return view as RenderResult;
}

/** "Your 履歴書 needs N more details:" in the page's language. */
function needs(n: number): string {
  return n === 1 ? s("rirekishoNeedsOne") : s("rirekishoNeedsMany").replace("{n}", String(n));
}

const field = (labelKey: Parameters<typeof s>[0]) =>
  screen.getByLabelText(new RegExp(s(labelKey))) as HTMLInputElement;
const saveButton = () => screen.getByRole("button", { name: common("saveChanges") });
const unsaved = (n: number) =>
  n === 1 ? s("unsavedOne") : s("unsavedMany").replace("{n}", String(n));

async function save() {
  await act(async () => {
    fireEvent.click(saveButton());
  });
}

beforeEach(() => {
  updateProfile.saves = [];
  updateProfile.current = {
    mutateAsync: (update: unknown) => {
      updateProfile.saves.push(update);
      return Promise.resolve();
    },
    isPending: false,
    error: null,
  };
  deleteAccount.calls = 0;
  deleteAccount.current = {
    mutateAsync: () => {
      deleteAccount.calls += 1;
      return Promise.resolve();
    },
    isPending: false,
    error: null,
  };
  session.signOuts = 0;
  session.pushes = [];
  session.signOutFails = false;
  toasts.list = [];
  confirm.calls = 0;
  confirm.answer = true;
});

describe("settings page, the 履歴書 completeness banner", () => {
  it("says so when nothing is missing", async () => {
    await renderPage();
    expect(screen.getByText(s("rirekishoReady"))).toBeInTheDocument();
  });

  it("counts what is missing", async () => {
    await renderPage(me({ phone_number: null, mailing_address: null }));
    expect(screen.getByText(needs(2))).toBeInTheDocument();
  });

  it.each([
    ["full_name", "fullName"],
    ["name_kana", "nameKana"],
    ["gender", "gender"],
    ["phone_number", "phone"],
    ["mailing_address", "address"],
  ] as Array<[string, Parameters<typeof s>[0]]>)("counts a missing %s", async (key, labelKey) => {
    // One case per required field: without gender here, deleting its arm
    // from isFieldMissing passed the whole suite.
    await renderPage(key === "full_name" ? me({}, { full_name: null }) : me({ [key]: null }));
    expect(screen.getByText(needs(1))).toBeInTheDocument();
    expect(screen.getByRole("button", { name: s(labelKey) })).toBeInTheDocument();
  });

  it("moves focus to the field a reader picks from the list", async () => {
    await renderPage(me({ phone_number: null }));
    fireEvent.click(screen.getByRole("button", { name: s("phone") }));
    expect(document.activeElement).toBe(document.getElementById("rirekisho-field-phone_number"));
  });

  it("follows the form as it is edited, before any save", async () => {
    await renderPage(me({ phone_number: null }));
    fireEvent.change(document.getElementById("rirekisho-field-phone_number") as HTMLElement, {
      target: { value: "080" },
    });
    expect(screen.getByText(s("rirekishoReady"))).toBeInTheDocument();
  });
});

describe("settings page, the fields a held visa adds", () => {
  it("requires two more fields when a visa is held", async () => {
    await renderPage(me({ visa_status: "held" }));
    expect(screen.getByText(needs(2))).toBeInTheDocument();
    expect(screen.getByRole("button", { name: s("visaCategory") })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: s("visaExpiration") })).toBeInTheDocument();
  });

  it("requires them as soon as the status is changed, before saving", async () => {
    // visa_status used to live in the other form, so this only updated after
    // a save there.
    await renderPage();
    fireEvent.click(screen.getByRole("radio", { name: s("visaHeld") }));
    expect(screen.getByText(needs(2))).toBeInTheDocument();
  });

  it("counts them as met once they are filled in", async () => {
    await renderPage(
      me({
        visa_status: "held",
        visa_category: "技術・人文知識・国際業務",
        residence_card_expiration: "2030-01-01",
      }),
    );
    expect(screen.getByText(s("rirekishoReady"))).toBeInTheDocument();
  });

  it.each(["none", "pending"] as VisaStatus[])(
    "does not ask for them when the visa status is %s",
    async (visa_status) => {
      await renderPage(me({ visa_status }));
      expect(screen.getByText(s("rirekishoReady"))).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: s("visaCategory") })).not.toBeInTheDocument();
    },
  );
});

describe("settings page, the date of birth age range", () => {
  it("accepts someone who turns 16 today", async () => {
    await renderPage(me({ date_of_birth: birthDateForAge(16) }));
    expect(screen.getByText(s("rirekishoReady"))).toBeInTheDocument();
  });

  it("rejects someone whose 16th birthday is tomorrow", async () => {
    await renderPage(me({ date_of_birth: birthDateForAge(16, 1) }));
    expect(screen.getByText(needs(1))).toBeInTheDocument();
    expect(screen.getByRole("button", { name: s("dateOfBirth") })).toBeInTheDocument();
  });

  it("accepts someone who turns 80 today", async () => {
    await renderPage(me({ date_of_birth: birthDateForAge(80) }));
    expect(screen.getByText(s("rirekishoReady"))).toBeInTheDocument();
  });

  it("rejects someone who turned 81 yesterday", async () => {
    await renderPage(me({ date_of_birth: birthDateForAge(81, -1) }));
    expect(screen.getByText(needs(1))).toBeInTheDocument();
  });

  it("rejects a date of birth that was never given", async () => {
    await renderPage(me({ date_of_birth: null }));
    expect(screen.getByText(needs(1))).toBeInTheDocument();
  });
});

describe("settings page, the save bar", () => {
  it("stays out of the way until something is edited", async () => {
    await renderPage();
    expect(screen.queryByRole("button", { name: common("saveChanges") })).not.toBeInTheDocument();
  });

  it("counts the unsaved changes", async () => {
    await renderPage();
    fireEvent.change(field("phone"), { target: { value: "080" } });
    expect(screen.getByText(unsaved(1))).toBeInTheDocument();
    fireEvent.change(field("hobbies"), { target: { value: "登山" } });
    expect(screen.getByText(unsaved(2))).toBeInTheDocument();
  });

  it("sends only what changed, and leaves once it's saved", async () => {
    await renderPage();
    fireEvent.change(field("nameKana"), { target: { value: "すずき はなこ" } });
    await save();

    expect(updateProfile.saves).toEqual([{ name_kana: "すずき はなこ" }]);
    expect(toasts.list.map((toast) => toast.description)).toEqual([common("saved")]);
    expect(screen.queryByRole("button", { name: common("saveChanges") })).not.toBeInTheDocument();
  });

  it("puts everything back on Discard", async () => {
    await renderPage();
    fireEvent.change(field("phone"), { target: { value: "080" } });
    fireEvent.click(screen.getByRole("button", { name: s("discard") }));
    expect(field("phone")).toHaveValue("090-0000-0000");
    expect(screen.queryByText(unsaved(1))).not.toBeInTheDocument();
  });

  it("stops an impossible number of years before it is sent", async () => {
    // The input's own max makes the form invalid, so the browser blocks it.
    await renderPage();
    fireEvent.change(field("yearsExp"), { target: { value: "81" } });
    await save();
    expect(field("yearsExp").validity.rangeOverflow).toBe(true);
    expect(updateProfile.saves).toEqual([]);
  });

  it("still refuses it if the form is submitted past that", async () => {
    // The zod rule behind the input's max, reachable only by submitting the
    // form directly.
    await renderPage();
    fireEvent.change(field("yearsExp"), { target: { value: "81" } });
    await act(async () => {
      fireEvent.submit(field("yearsExp").form as HTMLFormElement);
    });
    expect(updateProfile.saves).toEqual([]);
    expect(screen.getByText(s("yearsRange"))).toBeInTheDocument();
  });

  it("keeps the edits and says why when a save fails", async () => {
    updateProfile.current = {
      ...updateProfile.current,
      mutateAsync: () => Promise.reject(new ApiClientError(500, "boom")),
    };
    await renderPage();
    fireEvent.change(field("nameKana"), { target: { value: "すずき はなこ" } });
    await save();

    expect(screen.getByRole("alert")).toHaveTextContent(common("errorServer"));
    expect(toasts.list).toEqual([]);
    expect(field("nameKana")).toHaveValue("すずき はなこ");
    expect(screen.getByText(unsaved(1))).toBeInTheDocument();
  });

  it("explains a refused save in the reader's language", async () => {
    updateProfile.current = {
      ...updateProfile.current,
      mutateAsync: () => Promise.reject(new ApiClientError(422, "years_experience: invalid")),
    };
    await renderPage();
    fireEvent.change(field("phone"), { target: { value: "080" } });
    await save();

    expect(screen.getByRole("alert")).toHaveTextContent(common("errorInvalidInput"));
    expect(screen.getByRole("alert")).not.toHaveTextContent("years_experience");
  });

  it("shows a save in progress", async () => {
    updateProfile.current = { ...updateProfile.current, isPending: true };
    await renderPage();
    fireEvent.change(field("phone"), { target: { value: "080" } });
    expect(saveButton()).toHaveAttribute("aria-busy", "true");
  });

  it("clears a text field for real, and doesn't count emptying a date", async () => {
    await renderPage();
    fireEvent.change(field("address"), { target: { value: "" } });
    fireEvent.change(field("dateOfBirth"), { target: { value: "" } });
    await save();
    expect(updateProfile.saves).toEqual([{ mailing_address: "" }]);
  });
});

describe("settings page, the fields", () => {
  it("shows the email read-only and never sends it", async () => {
    await renderPage();
    const email = field("email");
    expect(email).toHaveValue("taro@example.test");
    expect(email).toHaveAttribute("readonly");
  });

  it("doesn't count the app language as an unsaved change", async () => {
    await renderPage();
    // Switching to English re-renders the page in English, so look for the
    // unsaved-changes line in either language.
    fireEvent.click(screen.getByRole("button", { name: /English/ }));
    expect(screen.queryByText(/unsaved change|未保存の変更/)).not.toBeInTheDocument();
  });

  it("adds a target role as a chip and sends the list", async () => {
    await renderPage();
    const roles = screen.getByRole("textbox", { name: s("targetRoles") });
    fireEvent.change(roles, { target: { value: "SRE" } });
    fireEvent.keyDown(roles, { key: "Enter" });
    await save();
    expect(updateProfile.saves).toEqual([{ target_role: ["SRE"] }]);
  });

  it("clears commute time when its switch goes off", async () => {
    await renderPage(me({ commute_time: "約45分" }));
    const toggle = screen.getByRole("switch", { name: s("showCommute") });
    expect(toggle).toHaveAttribute("aria-checked", "true");
    fireEvent.click(toggle);
    await save();
    expect(updateProfile.saves).toEqual([{ commute_time: "" }]);
  });

  it("offers the app language, not a preferred-language setting", async () => {
    await renderPage();
    expect(screen.getByText(s("appLanguage"))).toBeInTheDocument();
    // The old setting was a <select> of languages; the only selects left are
    // gender and JLPT level.
    const selects = screen.getAllByRole("combobox");
    expect(selects).toHaveLength(2);
    for (const select of selects) {
      expect(within(select).queryByRole("option", { name: /English/ })).not.toBeInTheDocument();
    }
  });
});

describe("settings page, deleting the account", () => {
  async function openConfirm() {
    await renderPage();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: s("deleteBtn") }));
    });
  }
  const phraseBox = () => screen.getByPlaceholderText(s("confirmPhrase"));
  const confirmButton = () => screen.getByRole("button", { name: s("confirmDeletion") });

  it("asks for a typed confirmation first", async () => {
    await openConfirm();
    expect(confirmButton()).toBeDisabled();
  });

  it("will not delete on the wrong phrase", async () => {
    await openConfirm();
    fireEvent.change(phraseBox(), { target: { value: "delete" } });
    expect(confirmButton()).toBeDisabled();
  });

  it("accepts the phrase whatever case it is typed in", async () => {
    // English on purpose: the Japanese phrase has no letter case.
    const phrase = t("settings", "confirmPhrase", "en");
    expect(phrase.toUpperCase()).not.toBe(phrase);
    meQuery.current = { data: me(), isLoading: false, error: null };
    await act(async () => {
      renderIn("en", <SettingsPage />);
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: t("settings", "deleteBtn", "en") }));
    });
    fireEvent.change(screen.getByPlaceholderText(phrase), { target: { value: phrase.toUpperCase() } });
    expect(
      screen.getByRole("button", { name: t("settings", "confirmDeletion", "en") }),
    ).not.toBeDisabled();
  });

  it("deletes, signs out and leaves for the sign-in page", async () => {
    await openConfirm();
    fireEvent.change(phraseBox(), { target: { value: s("confirmPhrase") } });
    await act(async () => {
      fireEvent.click(confirmButton());
    });
    expect(deleteAccount.calls).toBe(1);
    expect(session.signOuts).toBe(1);
    expect(session.pushes).toEqual([SIGN_IN_ROUTE]);
  });

  it("keeps the reader signed in when the deletion fails", async () => {
    deleteAccount.current = {
      mutateAsync: () => {
        deleteAccount.calls += 1;
        return Promise.reject(new ApiClientError(500, "boom"));
      },
      isPending: false,
      error: new ApiClientError(500, "boom"),
    };
    await openConfirm();
    fireEvent.change(phraseBox(), { target: { value: s("confirmPhrase") } });
    await act(async () => {
      fireEvent.click(confirmButton());
    });
    expect(deleteAccount.calls).toBe(1);
    expect(session.signOuts).toBe(0);
    expect(session.pushes).toEqual([]);
    expect(screen.getByRole("alert")).toHaveTextContent(common("errorServer"));
  });

  it("still leaves for sign-in when signing out fails after the delete", async () => {
    session.signOutFails = true;
    await openConfirm();
    fireEvent.change(phraseBox(), { target: { value: s("confirmPhrase") } });
    await act(async () => {
      fireEvent.click(confirmButton());
    });
    expect(session.pushes).toEqual([SIGN_IN_ROUTE]);
  });

  it("puts the confirmation away again on cancel", async () => {
    await openConfirm();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: common("cancel") }));
    });
    expect(screen.queryByPlaceholderText(s("confirmPhrase"))).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: s("deleteBtn") })).toBeInTheDocument();
  });
});

describe("settings page, before the profile arrives", () => {
  it("shows a skeleton rather than an empty form", async () => {
    const { container } = await renderPage(undefined, { isLoading: true });
    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
    expect(screen.queryByText(s("rirekishoReady"))).not.toBeInTheDocument();
  });

  it("says why when the profile can't be loaded", async () => {
    await renderPage(undefined, { error: new ApiClientError(500, "boom") });
    expect(screen.getByRole("alert")).toHaveTextContent(common("errorServer"));
  });
});

describe("settings page, structure", () => {
  it("has one h1 and a titled section per card", async () => {
    await renderPage();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    for (const key of ["profile", "sectionVisa", "sectionExtras", "sectionCareer", "sectionAccount"]) {
      expect(screen.getByRole("heading", { level: 2, name: s(key) })).toBeInTheDocument();
    }
    expect(within(screen.getByRole("region", { name: s("profile") })).getByLabelText(s("email"))).toBeInTheDocument();
  });
});
```

Run: `cd frontend && npx vitest run tests/app/settings.test.tsx`

Expected: FAIL. Today's page has no save bar, radios, switches or chips.

- [ ] **Step 3: The card shell, banner and cards**

`frontend/components/settings/settings-card.tsx`:

```tsx
import * as React from "react";
import type { Language } from "@/lib/i18n";
import type { SettingsErrors, SettingsValues } from "@/lib/settings-form";
import { cn } from "@/lib/utils";

/** What every form card is given by SettingsForm. */
export interface CardProps {
  values: SettingsValues;
  saved: SettingsValues;
  errors: SettingsErrors;
  update: <K extends keyof SettingsValues>(key: K, value: SettingsValues[K]) => void;
  lang: Language;
}

/** A titled card; the section menu scrolls to its id. Fields sit two across on md+. */
export function SettingsCard({
  id,
  title,
  description,
  className,
  children,
}: {
  id: string;
  title: string;
  description?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className={cn("scroll-mt-28 rounded-lg border bg-card p-5 sm:p-6 lg:scroll-mt-8", className)}
    >
      <h2 id={`${id}-title`} className="text-base font-semibold">
        {title}
      </h2>
      {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      <div className="mt-5 grid gap-5 md:grid-cols-2">{children}</div>
    </section>
  );
}
```

`frontend/components/settings/completeness-banner.tsx`:

```tsx
"use client";

import { fieldId, missingFieldLabel } from "@/lib/rirekisho-completeness";
import { t, type Language } from "@/lib/i18n";

function focusField(key: string) {
  const el = document.getElementById(fieldId(key));
  if (el) {
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.focus({ preventScroll: true });
  }
}

/** What the 履歴書 still needs, each item a link to its field. */
export function CompletenessBanner({ missingKeys, lang }: { missingKeys: string[]; lang: Language }) {
  if (missingKeys.length === 0) {
    return (
      <p className="rounded-lg bg-success-soft px-4 py-3 text-sm font-medium text-success">
        {t("settings", "rirekishoReady", lang)}
      </p>
    );
  }
  const heading =
    missingKeys.length === 1
      ? t("settings", "rirekishoNeedsOne", lang)
      : t("settings", "rirekishoNeedsMany", lang).replace("{n}", String(missingKeys.length));
  return (
    <div className="rounded-lg bg-warning-soft px-4 py-3 text-sm text-warning">
      <p className="font-semibold">{heading}</p>
      <p className="mt-1 flex flex-wrap gap-x-1">
        {missingKeys.map((key, index) => (
          <span key={key}>
            <button
              type="button"
              onClick={() => focusField(key)}
              className="rounded font-medium text-indigo underline underline-offset-2 hover:no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {missingFieldLabel(key, lang)}
            </button>
            {index < missingKeys.length - 1 ? t("nav", "countSep", lang) : ""}
          </span>
        ))}
      </p>
    </div>
  );
}
```

`frontend/components/settings/profile-card.tsx`:

```tsx
"use client";

import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { PhotoUploader } from "@/components/profile/PhotoUploader";
import { SettingsCard, type CardProps } from "@/components/settings/settings-card";
import { fieldId } from "@/lib/rirekisho-completeness";
import { t } from "@/lib/i18n";
import { isChanged } from "@/lib/settings-form";
import type { Gender } from "@/types/api";

export function ProfileCard({ values, saved, update, lang, email }: CardProps & { email: string }) {
  const s = (key: string) => t("settings", key, lang);
  const changed = (key: keyof typeof values) => isChanged(saved, values, key);
  return (
    <SettingsCard id="profile" title={s("profile")} description={s("profileDesc")}>
      <Field label={s("fullName")}>
        <Input
          id={fieldId("full_name")}
          value={values.full_name}
          onChange={(e) => update("full_name", e.target.value)}
          changed={changed("full_name")}
        />
      </Field>
      <Field label={s("nameKana")}>
        <Input
          id={fieldId("name_kana")}
          lang="ja"
          placeholder="ヤマダ タロウ"
          value={values.name_kana}
          onChange={(e) => update("name_kana", e.target.value)}
          changed={changed("name_kana")}
        />
      </Field>
      <Field label={s("dateOfBirth")}>
        <Input
          id={fieldId("date_of_birth")}
          type="date"
          value={values.date_of_birth}
          onChange={(e) => update("date_of_birth", e.target.value)}
          changed={changed("date_of_birth")}
        />
      </Field>
      <Field label={s("gender")}>
        <Select
          id={fieldId("gender")}
          value={values.gender}
          onChange={(e) => update("gender", e.target.value as Gender | "")}
          changed={changed("gender")}
        >
          <option value="" disabled>
            {s("genderSelect")}
          </option>
          <option value="male">{s("genderMale")}</option>
          <option value="female">{s("genderFemale")}</option>
        </Select>
      </Field>
      <Field label={s("nationality")} optionalLabel={s("optional")}>
        <Input
          value={values.nationality}
          onChange={(e) => update("nationality", e.target.value)}
          changed={changed("nationality")}
        />
      </Field>
      <Field label={s("phone")}>
        <Input
          id={fieldId("phone_number")}
          type="tel"
          value={values.phone_number}
          onChange={(e) => update("phone_number", e.target.value)}
          changed={changed("phone_number")}
        />
      </Field>
      <Field label={s("address")} className="md:col-span-2">
        <Input
          id={fieldId("mailing_address")}
          value={values.mailing_address}
          onChange={(e) => update("mailing_address", e.target.value)}
          changed={changed("mailing_address")}
        />
      </Field>
      <Field label={s("email")} hint={s("emailHint")}>
        <Input value={email} readOnly />
      </Field>
      <div className="space-y-1.5">
        <p className="flex items-baseline gap-2 text-sm font-medium">
          {s("photo")}
          <span className="text-xs font-normal text-muted-foreground">{s("optional")}</span>
        </p>
        <PhotoUploader />
        <p className="text-xs text-muted-foreground">{s("photoHint")}</p>
      </div>
    </SettingsCard>
  );
}
```

`frontend/components/settings/visa-card.tsx`:

```tsx
"use client";

import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { SettingsCard, type CardProps } from "@/components/settings/settings-card";
import { fieldId } from "@/lib/rirekisho-completeness";
import { t } from "@/lib/i18n";
import { isChanged } from "@/lib/settings-form";
import type { VisaStatus } from "@/types/api";

export function VisaCard({ values, saved, update, lang }: CardProps) {
  const s = (key: string) => t("settings", key, lang);
  const changed = (key: keyof typeof values) => isChanged(saved, values, key);
  // Category and expiry are needed only once a visa is held, and this reads
  // the unsaved status, so the tags change as soon as the status does.
  const optional = values.visa_status === "held" ? undefined : s("optional");
  return (
    <SettingsCard id="visa" title={s("sectionVisa")} description={s("visaDesc")}>
      <SegmentedControl<VisaStatus>
        legend={s("visaStatus")}
        name="visa_status"
        value={values.visa_status}
        onChange={(value) => update("visa_status", value)}
        options={[
          { value: "none", label: s("visaNone") },
          { value: "pending", label: s("visaPending") },
          { value: "held", label: s("visaHeld") },
        ]}
        className="md:col-span-2"
      />
      <Field label={s("visaCategory")} optionalLabel={optional}>
        <Input
          id={fieldId("visa_category")}
          value={values.visa_category}
          onChange={(e) => update("visa_category", e.target.value)}
          changed={changed("visa_category")}
        />
      </Field>
      <Field label={s("visaExpiration")} optionalLabel={optional}>
        <Input
          id={fieldId("residence_card_expiration")}
          type="date"
          value={values.residence_card_expiration}
          onChange={(e) => update("residence_card_expiration", e.target.value)}
          changed={changed("residence_card_expiration")}
        />
      </Field>
    </SettingsCard>
  );
}
```

`frontend/components/settings/extras-card.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { SettingsCard, type CardProps } from "@/components/settings/settings-card";
import { t } from "@/lib/i18n";
import { isChanged, type SettingsValues } from "@/lib/settings-form";

/**
 * A 履歴書 box that prints only when switched on. Switching off clears the
 * value (sent as "", which clears it), so the box leaves the 履歴書.
 */
function ToggleField({
  field,
  switchKey,
  labelKey,
  exampleKey,
  offKey,
  values,
  saved,
  update,
  lang,
}: Pick<CardProps, "values" | "saved" | "update" | "lang"> & {
  field: "commute_time" | "dependents";
  switchKey: string;
  labelKey: string;
  exampleKey: string;
  offKey: string;
}) {
  const s = (key: string) => t("settings", key, lang);
  const [on, setOn] = useState(values[field] !== "");
  return (
    <div className="space-y-2">
      <Switch
        checked={on}
        onCheckedChange={(next) => {
          setOn(next);
          if (!next) update(field, "");
        }}
        label={s(switchKey)}
      />
      {on ? (
        <>
          <Input
            aria-label={s(labelKey)}
            value={values[field]}
            onChange={(e) => update(field, e.target.value)}
            changed={isChanged(saved, values, field)}
          />
          <p className="text-xs text-muted-foreground">{s(exampleKey)}</p>
        </>
      ) : (
        <p className="text-xs text-muted-foreground">{s(offKey)}</p>
      )}
    </div>
  );
}

export function ExtrasCard(props: CardProps) {
  const { values, saved, update, lang } = props;
  const s = (key: string) => t("settings", key, lang);
  const changed = (key: keyof SettingsValues) => isChanged(saved, values, key);
  return (
    <SettingsCard id="extras" title={s("sectionExtras")} description={s("extrasDesc")}>
      <Field label={s("hobbies")}>
        <Input
          value={values.hobbies}
          onChange={(e) => update("hobbies", e.target.value)}
          changed={changed("hobbies")}
        />
      </Field>
      <Field label={s("specialSkills")}>
        <Input
          value={values.special_skills}
          onChange={(e) => update("special_skills", e.target.value)}
          changed={changed("special_skills")}
        />
      </Field>
      <ToggleField
        {...props}
        field="commute_time"
        switchKey="showCommute"
        labelKey="commuteTime"
        exampleKey="commuteExample"
        offKey="commuteOff"
      />
      <ToggleField
        {...props}
        field="dependents"
        switchKey="showDependents"
        labelKey="dependents"
        exampleKey="dependentsExample"
        offKey="dependentsOff"
      />
      <Field
        label={s("personalRequests")}
        hint={s("personalRequestsHint")}
        className="md:col-span-2"
      >
        <Input
          lang="ja"
          value={values.personal_requests}
          onChange={(e) => update("personal_requests", e.target.value)}
          changed={changed("personal_requests")}
        />
      </Field>
    </SettingsCard>
  );
}
```

`frontend/components/settings/career-card.tsx`:

```tsx
"use client";

import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { TagInput } from "@/components/ui/tag-input";
import { SettingsCard, type CardProps } from "@/components/settings/settings-card";
import { t } from "@/lib/i18n";
import { isChanged, type SettingsValues } from "@/lib/settings-form";
import type { JapaneseLevel } from "@/types/api";

const JAPANESE_LEVELS: JapaneseLevel[] = ["N1", "N2", "N3", "N4", "N5", "none"];

export function CareerCard({ values, saved, errors, update, lang }: CardProps) {
  const s = (key: string) => t("settings", key, lang);
  const changed = (key: keyof SettingsValues) => isChanged(saved, values, key);
  return (
    <SettingsCard id="career" title={s("sectionCareer")} description={s("careerDesc")}>
      <Field label={s("jpLevel")}>
        <Select
          value={values.japanese_level}
          onChange={(e) => update("japanese_level", e.target.value as JapaneseLevel)}
          changed={changed("japanese_level")}
        >
          {JAPANESE_LEVELS.map((level) => (
            <option key={level} value={level}>
              {level === "none" ? s("jpNotTested") : level}
            </option>
          ))}
        </Select>
      </Field>
      <Field label={s("yearsExp")} error={errors.years_experience}>
        <Input
          type="number"
          min={0}
          max={80}
          value={values.years_experience}
          onChange={(e) => update("years_experience", e.target.value)}
          changed={changed("years_experience")}
        />
      </Field>
      <Field label={s("targetRoles")} className="md:col-span-2">
        <TagInput
          value={values.target_role}
          onChange={(next) => update("target_role", next)}
          placeholder={s("addRole")}
          removeLabel={s("removeTag")}
          changed={changed("target_role")}
        />
      </Field>
      <Field label={s("targetIndustries")} className="md:col-span-2">
        <TagInput
          value={values.target_industry}
          onChange={(next) => update("target_industry", next)}
          placeholder={s("addIndustry")}
          removeLabel={s("removeTag")}
          changed={changed("target_industry")}
        />
      </Field>
    </SettingsCard>
  );
}
```

`frontend/components/settings/account-card.tsx`:

```tsx
"use client";

import { LanguageSwitcher } from "@/components/language-switcher";
import { SettingsCard } from "@/components/settings/settings-card";
import { t, type Language } from "@/lib/i18n";

/** The app language: acts at once through the switcher's cookie, outside the form's Save. */
export function AccountCard({ lang }: { lang: Language }) {
  const s = (key: string) => t("settings", key, lang);
  return (
    <SettingsCard id="account" title={s("sectionAccount")}>
      <div className="space-y-1.5 md:col-span-2">
        <p className="text-sm font-medium">{s("appLanguage")}</p>
        <LanguageSwitcher />
        <p className="text-xs text-muted-foreground">{s("appLanguageHint")}</p>
      </div>
    </SettingsCard>
  );
}
```

`frontend/components/settings/delete-account-card.tsx`: port today's
`DangerZone` (page.tsx lines 729–829). The logic is the same, and so are
the comments in both `catch` blocks. It uses the primitives:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useClerk } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDeleteAccount } from "@/hooks/useAccount";
import { apiErrorMessage } from "@/lib/api-error";
import { t, type Language } from "@/lib/i18n";
import { SIGN_IN_ROUTE } from "@/lib/routes";

/** Account deletion, behind a typed phrase. Not part of the settings form. */
export function DeleteAccountCard({ lang }: { lang: Language }) {
  const router = useRouter();
  const { signOut } = useClerk();
  const deleteAccount = useDeleteAccount();
  const [showConfirm, setShowConfirm] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const s = (key: string) => t("settings", key, lang);

  const phrase = s("confirmPhrase");
  const ready = confirmText.toLowerCase() === phrase.toLowerCase();

  async function handleDelete() {
    if (!ready) return;
    try {
      await deleteAccount.mutateAsync();
    } catch {
      // The account is still there, so stay on the page with the reader
      // signed in; deleteAccount.error renders the reason below. Signing
      // them out here would strand them at the sign-in page with an account
      // they asked to delete and still have.
      return;
    }
    try {
      await signOut();
    } catch {
      // The account is gone by this point, so there is nothing to report and
      // nowhere useful to stay. Leaving them on a settings page for an
      // account that no longer exists is the worst outcome available, so
      // fall through to the redirect either way.
    }
    router.push(SIGN_IN_ROUTE);
  }

  return (
    <section
      aria-labelledby="delete-account-title"
      className="rounded-lg border border-destructive/30 bg-card p-5 sm:p-6"
    >
      <h2 id="delete-account-title" className="text-base font-semibold text-destructive">
        {s("deleteAccount")}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">{s("deleteDesc")}</p>

      {!showConfirm ? (
        <Button variant="destructive" className="mt-4" onClick={() => setShowConfirm(true)}>
          {s("deleteBtn")}
        </Button>
      ) : (
        <div className="mt-4 space-y-3">
          <p className="text-sm text-muted-foreground">
            {s("typeToConfirm")} <span className="font-mono font-medium text-foreground">{phrase}</span>{" "}
            {s("toConfirm")}
          </p>
          <Input
            aria-label={phrase}
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder={phrase}
            className="font-mono"
            autoFocus
          />
          {deleteAccount.error && (
            <p role="alert" className="text-sm text-destructive">
              {apiErrorMessage(deleteAccount.error, lang)}
            </p>
          )}
          <div className="flex gap-3">
            <Button
              variant="destructive"
              disabled={!ready}
              loading={deleteAccount.isPending}
              onClick={() => void handleDelete()}
            >
              {deleteAccount.isPending ? s("deleting") : s("confirmDeletion")}
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setShowConfirm(false);
                setConfirmText("");
              }}
            >
              {t("common", "cancel", lang)}
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 4: The save bar, the form and the page**

`frontend/components/settings/save-bar.tsx`:

```tsx
"use client";

import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { t, type Language } from "@/lib/i18n";

/**
 * Fixed to the bottom of the screen while there are unsaved changes. It sets
 * --save-bar-offset to its height, which the chat button adds to its bottom
 * margin, so the button never covers Save.
 */
export function SaveBar({
  count,
  saving,
  error,
  onDiscard,
  lang,
}: {
  count: number;
  saving: boolean;
  error: string | null;
  onDiscard: () => void;
  lang: Language;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const bar = ref.current;
    if (!bar) return;
    const root = document.documentElement;
    const setOffset = () => root.style.setProperty("--save-bar-offset", `${bar.offsetHeight}px`);
    setOffset();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(setOffset);
    observer?.observe(bar);
    return () => {
      observer?.disconnect();
      root.style.removeProperty("--save-bar-offset");
    };
  }, []);

  const label =
    count === 1
      ? t("settings", "unsavedOne", lang)
      : t("settings", "unsavedMany", lang).replace("{n}", String(count));

  return (
    <div
      ref={ref}
      role="region"
      aria-label={label}
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-primary text-primary-foreground lg:left-60"
    >
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-10">
        <div className="min-w-0">
          <p aria-live="polite" className="text-sm font-semibold">
            {label}
          </p>
          {error && (
            <p role="alert" className="text-sm text-destructive-soft">
              {error}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <Button
            variant="ghost"
            onClick={onDiscard}
            className="text-primary-foreground hover:bg-primary-foreground/10"
          >
            {t("settings", "discard", lang)}
          </Button>
          <Button type="submit" variant="secondary" loading={saving}>
            {t("common", "saveChanges", lang)}
          </Button>
        </div>
      </div>
    </div>
  );
}
```

`frontend/components/settings/settings-form.tsx`:

```tsx
"use client";

import { useState } from "react";
import { AccountCard } from "@/components/settings/account-card";
import { CareerCard } from "@/components/settings/career-card";
import { CompletenessBanner } from "@/components/settings/completeness-banner";
import { DeleteAccountCard } from "@/components/settings/delete-account-card";
import { ExtrasCard } from "@/components/settings/extras-card";
import { ProfileCard } from "@/components/settings/profile-card";
import { SaveBar } from "@/components/settings/save-bar";
import { VisaCard } from "@/components/settings/visa-card";
import { useToast } from "@/hooks/use-toast";
import { useUpdateProfile } from "@/hooks/useMe";
import { apiErrorMessage } from "@/lib/api-error";
import { useLang } from "@/lib/language-context";
import { t } from "@/lib/i18n";
import { computeMissingRirekishoFields } from "@/lib/rirekisho-completeness";
import {
  changedFields,
  formFromProfile,
  settleAfterSave,
  validateSettings,
  type SettingsErrors,
  type SettingsValues,
} from "@/lib/settings-form";
import type { MeResponse } from "@/types/api";

/**
 * The whole of Settings as one form: every card edits the same values, and
 * one save bar sends whatever differs from what's saved. Photo, app language
 * and account deletion act on their own and are outside it.
 */
export function SettingsForm({ me }: { me: MeResponse }) {
  const { lang } = useLang();
  const updateProfile = useUpdateProfile();
  const { toast } = useToast();

  const [saved, setSaved] = useState<SettingsValues>(() => formFromProfile(me));
  const [values, setValues] = useState<SettingsValues>(saved);
  const [errors, setErrors] = useState<SettingsErrors>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  // Bumped on Discard, so cards with local state (the switches) start over.
  const [resetKey, setResetKey] = useState(0);

  const changes = changedFields(saved, values);
  const count = Object.keys(changes).length;
  // The unsaved visa status counts, so the banner reacts as soon as it changes.
  const missingKeys = computeMissingRirekishoFields(values, values.visa_status);

  function update<K extends keyof SettingsValues>(key: K, value: SettingsValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
    if (key === "years_experience") setErrors({});
    setSaveError(null);
  }

  function discard() {
    setValues(saved);
    setErrors({});
    setSaveError(null);
    setResetKey((key) => key + 1);
  }

  async function save() {
    const found = validateSettings(values, lang);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    setSaveError(null);
    try {
      await updateProfile.mutateAsync(changes);
    } catch (error) {
      // Kept on screen with the edits; swallowed here only so a rejected
      // mutateAsync isn't an unhandled rejection.
      setSaveError(apiErrorMessage(error, lang));
      return;
    }
    const settled = settleAfterSave(saved, values);
    setSaved(settled);
    setValues(settled);
    toast({ variant: "success", description: t("common", "saved", lang) });
  }

  const cardProps = { values, saved, errors, update, lang };

  return (
    <div className="min-w-0 space-y-6 pb-28">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
        className="space-y-6"
      >
        <CompletenessBanner missingKeys={missingKeys} lang={lang} />
        <ProfileCard {...cardProps} email={me.user.email} />
        <VisaCard {...cardProps} />
        <ExtrasCard key={resetKey} {...cardProps} />
        <CareerCard {...cardProps} />
        <AccountCard lang={lang} />
        {count > 0 && (
          <SaveBar
            count={count}
            saving={updateProfile.isPending}
            error={saveError}
            onDiscard={discard}
            lang={lang}
          />
        )}
      </form>
      <DeleteAccountCard lang={lang} />
    </div>
  );
}
```

`frontend/app/dashboard/settings/page.tsx`: replace the whole file:

```tsx
"use client";

import { SettingsForm } from "@/components/settings/settings-form";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { useMe } from "@/hooks/useMe";
import { apiErrorMessage } from "@/lib/api-error";
import { useLang } from "@/lib/language-context";
import { t } from "@/lib/i18n";

export default function SettingsPage() {
  const { lang } = useLang();
  const { data: me, isLoading, error } = useMe();

  return (
    <>
      <PageHeader title={t("settings", "title", lang)} description={t("settings", "sub", lang)} />
      {isLoading ? (
        <SettingsSkeleton />
      ) : me ? (
        <SettingsForm me={me} />
      ) : (
        <p role="alert" className="text-sm text-destructive">
          {apiErrorMessage(error, lang)}
        </p>
      )}
    </>
  );
}

function SettingsSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-12 w-full" />
      {Array.from({ length: 3 }).map((_, i) => (
        <Skeleton key={i} className="h-64 w-full" />
      ))}
    </div>
  );
}
```

`frontend/components/chat-widget.tsx`: change the container's `bottom-6` to
`bottom-[calc(1.5rem+var(--save-bar-offset,0px))]`, and add a comment above
it:

```tsx
    {/* Rises above the Settings save bar, which sets --save-bar-offset. */}
    <div className="fixed bottom-[calc(1.5rem+var(--save-bar-offset,0px))] right-6 z-50 flex flex-col items-end gap-3">
```

- [ ] **Step 5: Run the tests**

Run: `cd frontend && npx vitest run tests/app/settings.test.tsx && npm test`

Expected: settings PASS, and the full suite green.

The language switcher's buttons carry each language's own name as sr-only
text ("EN English"), which is how the app-language test finds English.

- [ ] **Step 6: Prove the key behaviours are guarded**

Apply each change, run `npx vitest run tests/app/settings.test.tsx`,
confirm it FAILS, and restore the file:

| File | Change | Must fail |
|---|---|---|
| `components/settings/settings-form.tsx` | `computeMissingRirekishoFields(values, values.visa_status)` → `computeMissingRirekishoFields(values, saved.visa_status)` | "requires them as soon as the status is changed" |
| `lib/settings-form.ts` | delete `if (same(saved[key], value)) continue;` | "sends only what changed…" |
| `lib/settings-form.ts` | delete `if (value === "" && NOT_CLEARABLE.has(key)) continue;` | "clears a text field for real…" |
| `components/settings/settings-form.tsx` | delete `setValues(saved);` in `discard` | "puts everything back on Discard" |
| `components/settings/extras-card.tsx` | delete `if (!next) update(field, "");` | "clears commute time when its switch goes off" |

- [ ] **Step 7: Gates and commit**

```bash
cd frontend && npm test && npm run lint && npm run type-check && npm run format:check
git add lib/i18n.ts components/settings app/dashboard/settings/page.tsx components/chat-widget.tsx tests/app/settings.test.tsx
git commit -m "feat(settings): one form, one save bar, five cards

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Section menu and the leave guard

**Files:**
- Create: `frontend/components/settings/section-nav.tsx`,
  `frontend/components/settings/use-leave-guard.ts`
- Modify: `frontend/components/settings/settings-form.tsx`, adding both,
  plus the two-column grid
- Modify: `frontend/tests/app/settings.test.tsx`, adding cases

**Interfaces:**
- **Consumes:** `SettingsForm` from Task 4; `useConfirm` from
  `@/components/confirm-dialog-provider` (`(opts: { title, confirmLabel,
  cancelLabel, variant? }) => Promise<boolean>`); `useRouter`.
- **Produces:** `SectionNav({ lang })` and
  `useLeaveGuard(dirty: boolean, confirmLeave: () => Promise<boolean>)`.

- [ ] **Step 1: Write the failing tests**

Append to `frontend/tests/app/settings.test.tsx`:

```tsx
describe("settings page, the section menu", () => {
  it("lists the five sections, the first one current", async () => {
    await renderPage();
    const nav = screen.getByRole("navigation", { name: s("sectionsNav") });
    const links = within(nav).getAllByRole("link");
    expect(links.map((a) => a.getAttribute("href"))).toEqual([
      "#profile",
      "#visa",
      "#extras",
      "#career",
      "#account",
    ]);
    expect(links[0]).toHaveAttribute("aria-current", "true");
  });

  it("marks the section a reader jumps to", async () => {
    await renderPage();
    const nav = screen.getByRole("navigation", { name: s("sectionsNav") });
    fireEvent.click(within(nav).getByRole("link", { name: s("sectionCareer") }));
    expect(within(nav).getByRole("link", { name: s("sectionCareer") })).toHaveAttribute(
      "aria-current",
      "true",
    );
  });
});

describe("settings page, leaving with unsaved changes", () => {
  function beforeUnloadIsBlocked(): boolean {
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  }

  /** A link elsewhere in the app, as the sidebar would render. */
  function outsideLink(href = "/dashboard/jobs"): HTMLAnchorElement {
    const a = document.createElement("a");
    a.href = href;
    a.textContent = "Jobs";
    document.body.appendChild(a);
    return a;
  }

  it("asks the browser to confirm closing only while there are edits", async () => {
    await renderPage();
    expect(beforeUnloadIsBlocked()).toBe(false);
    fireEvent.change(field("phone"), { target: { value: "080" } });
    expect(beforeUnloadIsBlocked()).toBe(true);
  });

  it("asks before following a link, and stays on Keep editing", async () => {
    await renderPage();
    fireEvent.change(field("phone"), { target: { value: "080" } });
    confirm.answer = false;
    await act(async () => {
      fireEvent.click(outsideLink());
    });
    expect(confirm.calls).toBe(1);
    expect(session.pushes).toEqual([]);
  });

  it("follows the link on Discard", async () => {
    await renderPage();
    fireEvent.change(field("phone"), { target: { value: "080" } });
    await act(async () => {
      fireEvent.click(outsideLink());
    });
    expect(session.pushes).toEqual(["/dashboard/jobs"]);
  });

  it("doesn't ask for the section menu's own jumps", async () => {
    await renderPage();
    fireEvent.change(field("phone"), { target: { value: "080" } });
    const nav = screen.getByRole("navigation", { name: s("sectionsNav") });
    fireEvent.click(within(nav).getByRole("link", { name: s("sectionCareer") }));
    expect(confirm.calls).toBe(0);
  });
});
```

Also add `document.body.querySelectorAll("a[href='/dashboard/jobs']").forEach((a) => a.remove());`
to the file's `beforeEach`, so the appended links don't leak between tests.

Run: `cd frontend && npx vitest run tests/app/settings.test.tsx`

Expected: the six new tests FAIL (there's no navigation, and no
`beforeunload` handler).

- [ ] **Step 2: Implement `section-nav.tsx`**

```tsx
"use client";

import { useEffect, useState } from "react";
import { t, type Language } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const SECTIONS = [
  { id: "profile", key: "profile" },
  { id: "visa", key: "sectionVisa" },
  { id: "extras", key: "sectionExtras" },
  { id: "career", key: "sectionCareer" },
  { id: "account", key: "sectionAccount" },
] as const;

/**
 * Jumps between the cards and marks the one in view: a sticky list beside the
 * cards on lg+, a sticky row of chips above them on smaller screens.
 */
export function SectionNav({ lang }: { lang: Language }) {
  const [current, setCurrent] = useState<string>(SECTIONS[0].id);

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const inView = new Map<string, boolean>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) inView.set(entry.target.id, entry.isIntersecting);
        // The top-most card in the band below the sticky header.
        const top = SECTIONS.find((section) => inView.get(section.id));
        if (top) setCurrent(top.id);
      },
      { rootMargin: "-96px 0px -55% 0px" },
    );
    for (const section of SECTIONS) {
      const el = document.getElementById(section.id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, []);

  return (
    <nav
      aria-label={t("settings", "sectionsNav", lang)}
      className="sticky top-14 z-30 -mx-4 mb-6 overflow-x-auto border-b bg-background/95 px-4 py-2 backdrop-blur sm:-mx-6 sm:px-6 lg:top-8 lg:mx-0 lg:mb-0 lg:self-start lg:overflow-visible lg:border-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none"
    >
      <ul className="flex gap-2 lg:flex-col lg:gap-0.5">
        {SECTIONS.map((section) => {
          const active = current === section.id;
          return (
            <li key={section.id} className="shrink-0">
              <a
                href={`#${section.id}`}
                aria-current={active ? "true" : undefined}
                onClick={() => setCurrent(section.id)}
                className={cn(
                  "block whitespace-nowrap rounded-full border px-3 py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none",
                  "lg:relative lg:rounded-md lg:border-0 lg:px-3 lg:py-2",
                  active
                    ? "border-primary bg-primary text-primary-foreground lg:bg-secondary lg:font-semibold lg:text-foreground lg:before:absolute lg:before:inset-y-1.5 lg:before:left-0 lg:before:w-[3px] lg:before:rounded-r lg:before:bg-seal"
                    : "border-input text-secondary-foreground hover:bg-secondary",
                )}
              >
                {t("settings", section.key, lang)}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
```

- [ ] **Step 3: Implement `use-leave-guard.ts`**

```ts
"use client";

import { useEffect } from "react";
import type { Route } from "next";
import { useRouter } from "next/navigation";

/**
 * While `dirty`, stops the user leaving without a word:
 * - closing or reloading the tab gets the browser's own "Leave site?";
 * - an in-app link click is cancelled before Next's Link sees it (Link skips
 *   navigation when defaultPrevented), and `confirmLeave` decides whether to
 *   follow it. Jumps within the page (the section menu) are left alone.
 */
export function useLeaveGuard(dirty: boolean, confirmLeave: () => Promise<boolean>) {
  const router = useRouter();

  useEffect(() => {
    if (!dirty) return;

    function onBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
    }

    function onClick(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = (event.target as Element | null)?.closest?.("a[href]");
      if (!(link instanceof HTMLAnchorElement)) return;
      if (link.target || link.hasAttribute("download")) return;
      const url = new URL(link.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.hash) return;

      event.preventDefault();
      void confirmLeave().then((leave) => {
        if (leave) router.push(`${url.pathname}${url.search}${url.hash}` as Route);
      });
    }

    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [dirty, confirmLeave, router]);
}
```

- [ ] **Step 4: Wire them into `settings-form.tsx`**

- Add the imports:
  `import { useCallback, useState } from "react";`,
  `import { SectionNav } from "@/components/settings/section-nav";`,
  `import { useLeaveGuard } from "@/components/settings/use-leave-guard";` and
  `import { useConfirm } from "@/components/confirm-dialog-provider";`.
- After `const count = …`, add:

```tsx
  const confirm = useConfirm();
  const confirmLeave = useCallback(
    () =>
      confirm({
        title: t("settings", "leaveTitle", lang),
        confirmLabel: t("settings", "discard", lang),
        cancelLabel: t("settings", "keepEditing", lang),
        variant: "destructive",
      }),
    [confirm, lang],
  );
  useLeaveGuard(count > 0, confirmLeave);
```

- Wrap the returned JSX in the grid, so the menu sits beside the cards on
  `lg`:

```tsx
  return (
    <div className="lg:grid lg:grid-cols-[150px_minmax(0,1fr)] lg:gap-8">
      <SectionNav lang={lang} />
      <div className="min-w-0 space-y-6 pb-28">
        {/* the <form> … </form> and <DeleteAccountCard /> from Task 4, unchanged */}
      </div>
    </div>
  );
```

- [ ] **Step 5: Run the tests**

Run: `cd frontend && npx vitest run tests/app/settings.test.tsx && npm test`

Expected: all PASS.

- [ ] **Step 6: Prove the guard bites**

In `use-leave-guard.ts`, temporarily change
`if (!dirty) return;` to `if (dirty) return;`. The three leave tests must
FAIL. Restore it and re-run: PASS.

- [ ] **Step 7: Gates and commit**

```bash
cd frontend && npm test && npm run lint && npm run type-check && npm run format:check
git add components/settings tests/app/settings.test.tsx
git commit -m "feat(settings): section menu, and a warning before leaving unsaved changes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Verify in the browser

No code is written in this task unless a check fails. If one does, fix it,
re-run the gates, and commit the fix separately.

- [ ] **Step 1: Start the app**

Run `preview_start` for "backend" and "frontend". The user signs in.

- [ ] **Step 2: Desktop (1280×860)**

- [ ] The menu is sticky beside the cards and highlights the card in view
  as you scroll.
- [ ] Paired fields sit two across, and the banner is correct.
- [ ] Edit a field: the save bar appears with "1 unsaved change", and the
  field is outlined.
- [ ] Save: the network panel shows **one** `PATCH /api/v1/auth/me` whose
  body holds only that field. The bar leaves, and the "Saved" toast shows.
- [ ] Change the visa status to "Currently held": the banner updates
  immediately.
- [ ] With an edit, click a sidebar link: the dialog appears. "Keep
  editing" stays; "Discard" navigates.
- [ ] The chat button sits above the save bar: its computed `bottom` is
  24px plus the bar's height. That also confirms Tailwind emitted
  `calc(1.5rem + var(--save-bar-offset,0px))` with spaces around the `+`.

- [ ] **Step 3: Phone (375×812)**

- [ ] The chip row is sticky under the top bar and scrolls sideways.
- [ ] There is one column and no horizontal scroll
  (`scrollWidth === innerWidth`).
- [ ] The save bar spans the width, with the chat button above it.

- [ ] **Step 4: Languages and keyboard**

- [ ] In 日本語 and Indonesian, nothing overflows in the chips, segments or
  the bar.
- [ ] Tab through: the menu links, the fields, the segments (arrow keys),
  the switches (Space), the tag input (Enter, Backspace), then Save and
  Discard. Focus rings are visible throughout.

- [ ] **Step 5: Report**

Take screenshots (desktop with the bar showing, and phone) and show them to
the user.
