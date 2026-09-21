import { render, type RenderResult } from "@testing-library/react";
import type { ReactElement } from "react";
import { LanguageProvider } from "@/lib/language-context";
import type { Language } from "@/lib/i18n";

/** The three languages the app supports, for `it.each`/`for` loops. */
export const LANGS: Language[] = ["en", "id", "ja"];

/**
 * Render inside the real LanguageProvider.
 *
 * Deliberately not the app's Providers component: it builds a QueryClient
 * with retry: 1, so every error-path test would wait on a retry. Pages get
 * their data through hooks, and those are mocked per test.
 */
export function renderIn(lang: Language, ui: ReactElement): RenderResult {
  return render(<LanguageProvider initialLang={lang}>{ui}</LanguageProvider>);
}
