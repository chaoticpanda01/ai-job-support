"use client";

import { useLang } from "@/lib/language-context";
import { LANGUAGES, t } from "@/lib/i18n";

export function LanguageSwitcher() {
  const { lang, setLang } = useLang();

  // A group of toggle buttons. aria-pressed tells screen readers which language
  // is active, which the highlight colour alone could not.
  return (
    <div
      role="group"
      aria-label={t("nav", "language", lang)}
      className="flex items-center overflow-hidden rounded-md border bg-background"
    >
      {LANGUAGES.map(({ code, label }) => (
        <button
          key={code}
          aria-pressed={lang === code}
          onClick={() => setLang(code)}
          className={`px-2.5 py-1 text-xs font-medium transition-colors ${
            lang === code
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-accent hover:text-foreground"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
