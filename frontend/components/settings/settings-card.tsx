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
  /** On leaving a field the backend can't empty: put the saved value back if it's empty. */
  restoreIfEmpty: (key: keyof SettingsValues) => void;
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
