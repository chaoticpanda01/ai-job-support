"use client";

import { useEffect, useState } from "react";
import { ErrorFallback, type ErrorBoundaryProps } from "@/components/error-fallback";
import { DEFAULT_LANGUAGE, languageFromCookies, type Language } from "@/lib/i18n";
import "./globals.css";

/**
 * Replaces the root layout when the layout itself throws, so it renders its own
 * <html> and <body> and imports the global styles. Next shows this only in
 * production; in development its error overlay appears instead.
 */
export default function GlobalError(props: ErrorBoundaryProps) {
  // The root layout, which reads the saved language on the server, is what
  // failed. Read the cookie after mount instead; the first paint uses the default.
  const [lang, setLang] = useState<Language>(DEFAULT_LANGUAGE);
  useEffect(() => {
    setLang(languageFromCookies(document.cookie) ?? DEFAULT_LANGUAGE);
  }, []);

  return (
    <html lang={lang}>
      {/* The root layout's next/font variables don't exist here, and font-sans
          would resolve to the browser's serif default, so use a system font. */}
      <body
        className="min-h-screen bg-background text-foreground antialiased"
        style={{ fontFamily: "system-ui, sans-serif" }}
      >
        <main className="container">
          <ErrorFallback {...props} lang={lang} />
        </main>
      </body>
    </html>
  );
}
