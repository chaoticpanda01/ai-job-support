"use client";

import { useLang } from "@/lib/language-context";
import { LANGUAGES, t } from "@/lib/i18n";

export function LanguageSwitcher() {
  const { lang, setLang } = useLang();

  return (
    <div
      role="group"
      aria-label={t("nav", "language", lang)}
      className="flex items-center overflow-hidden rounded-md border bg-background"
    >
      {LANGUAGES.map(({ code, label, name }) => {
        const active = lang === code;
        // aria-pressed exposes the active language; the highlight is colour only.
        return (
          <button
            key={code}
            type="button"
            aria-pressed={active}
            onClick={() => setLang(code)}
            className={`px-2.5 py-1 text-xs font-medium transition-colors ${
              active
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-foreground"
            }`}
          >
            {label}
            <span lang={code} className="sr-only">
              {` ${name}`}
            </span>
          </button>
        );
      })}
    </div>
  );
}
