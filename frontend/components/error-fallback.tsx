"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useLang } from "@/lib/language-context";
import { t, type Language } from "@/lib/i18n";

export interface ErrorBoundaryProps {
  error: Error & { digest?: string };
  reset: () => void;
}

/**
 * Shared body for the app's error boundaries. It renders no <main>: the root
 * and global boundaries wrap it in one, and the dashboard boundary already
 * sits inside the dashboard layout's <main>.
 */
export function ErrorFallback({
  error,
  reset,
  lang: langOverride,
}: ErrorBoundaryProps & {
  /** For global-error.tsx, which renders outside the language provider. */
  lang?: Language | undefined;
}) {
  const { lang: contextLang } = useLang();
  const lang = langOverride ?? contextLang;
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-16 text-center">
      <div role="alert" className="space-y-2">
        <h1 className="font-display text-2xl font-bold">{t("common", "errorPageTitle", lang)}</h1>
        <p className="text-sm text-muted-foreground">{t("common", "errorPageBody", lang)}</p>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row">
        <Button type="button" onClick={reset}>
          {t("common", "tryAgain", lang)}
        </Button>
        <Button asChild variant="secondary">
          <Link href="/">{t("common", "goHome", lang)}</Link>
        </Button>
      </div>
      {error.digest && (
        <p className="text-xs text-muted-foreground">
          {t("common", "errorId", lang)}: <code className="font-mono">{error.digest}</code>
        </p>
      )}
    </div>
  );
}
