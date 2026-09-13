"use client";

import Link from "next/link";
import { useLang } from "@/lib/language-context";
import { t } from "@/lib/i18n";

export interface ErrorBoundaryProps {
  error: Error & { digest?: string };
  reset: () => void;
}

/**
 * Shared body for the app's error boundaries. It renders no <main>: the root
 * and global boundaries wrap it in one, and the dashboard boundary already
 * sits inside the dashboard layout's <main>.
 */
export function ErrorFallback({ error, reset }: ErrorBoundaryProps) {
  const { lang } = useLang();
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-16 text-center">
      <div role="alert" className="space-y-2">
        <h1 className="text-2xl font-semibold">{t("common", "errorPageTitle", lang)}</h1>
        <p className="text-sm text-muted-foreground">{t("common", "errorPageBody", lang)}</p>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row">
        <button
          type="button"
          onClick={reset}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          {t("common", "tryAgain", lang)}
        </button>
        <Link href="/" className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-accent">
          {t("common", "goHome", lang)}
        </Link>
      </div>
      {error.digest && (
        <p className="text-xs text-muted-foreground">
          {t("common", "errorId", lang)}: <code className="font-mono">{error.digest}</code>
        </p>
      )}
    </div>
  );
}
