"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { DEFAULT_LANGUAGE, LANGUAGE_COOKIE, type Language } from "@/lib/i18n";

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

interface LanguageContextValue {
  lang: Language;
  setLang: (lang: Language) => void;
}

const LanguageContext = createContext<LanguageContextValue>({
  lang: DEFAULT_LANGUAGE,
  setLang: () => {},
});

export function LanguageProvider({
  children,
  initialLang,
}: {
  children: React.ReactNode;
  /** The language the server rendered, read from the saved cookie. */
  initialLang: Language;
}) {
  const [lang, setLangState] = useState<Language>(initialLang);

  // Only an explicit choice is saved. The root layout reads the cookie on the
  // next full page load.
  const setLang = useCallback((next: Language) => {
    setLangState(next);
    const secure = window.location.protocol === "https:" ? "; secure" : "";
    document.cookie = `${LANGUAGE_COOKIE}=${next}; path=/; max-age=${ONE_YEAR_SECONDS}; samesite=lax${secure}`;
  }, []);

  // Switching languages doesn't re-render the server layout, so sync <html lang>
  // here. Screen readers choose pronunciation from it.
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  return <LanguageContext.Provider value={{ lang, setLang }}>{children}</LanguageContext.Provider>;
}

export function useLang() {
  return useContext(LanguageContext);
}
