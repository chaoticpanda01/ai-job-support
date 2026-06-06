"use client";

import { useLang } from "@/lib/language-context";
import { LANGUAGES } from "@/lib/i18n";

export function LanguageSwitcher() {
  const { lang, setLang } = useLang();

  return (
    <div className="flex items-center rounded-md border bg-background overflow-hidden">
      {LANGUAGES.map(({ code, label }) => (
        <button
          key={code}
          onClick={() => setLang(code)}
          className={`px-2.5 py-1 text-xs font-medium transition-colors ${
            lang === code
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground hover:bg-accent"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
