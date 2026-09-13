"use client";

import { ErrorFallback, type ErrorBoundaryProps } from "@/components/error-fallback";
import { DEFAULT_LANGUAGE } from "@/lib/i18n";
import "./globals.css";

/**
 * Replaces the root layout when the layout itself throws, so it renders its own
 * <html> and <body> and imports the global styles. It sits outside <Providers>,
 * so ErrorFallback gets the language context's default. Next shows this only in
 * production; in development its error overlay appears instead.
 */
export default function GlobalError(props: ErrorBoundaryProps) {
  return (
    <html lang={DEFAULT_LANGUAGE}>
      {/* The root layout's next/font variables don't exist here, and font-sans
          would resolve to the browser's serif default, so use a system font. */}
      <body
        className="min-h-screen bg-background text-foreground antialiased"
        style={{ fontFamily: "system-ui, sans-serif" }}
      >
        <main className="container">
          <ErrorFallback {...props} />
        </main>
      </body>
    </html>
  );
}
