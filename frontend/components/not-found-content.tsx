"use client";

import Link from "next/link";
import { useLang } from "@/lib/language-context";
import { t } from "@/lib/i18n";

/** Translated body of app/not-found.tsx, which stays a server component so it can set metadata. */
export function NotFoundContent() {
  const { lang } = useLang();
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-16 text-center">
      <div className="space-y-2">
        <p className="text-sm font-medium text-muted-foreground">404</p>
        <h1 className="text-2xl font-semibold">{t("common", "notFoundTitle", lang)}</h1>
        <p className="text-sm text-muted-foreground">{t("common", "notFoundBody", lang)}</p>
      </div>
      <Link
        href="/"
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
      >
        {t("common", "goHome", lang)}
      </Link>
    </div>
  );
}
