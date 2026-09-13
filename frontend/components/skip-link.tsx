"use client";

import { useLang } from "@/lib/language-context";
import { t } from "@/lib/i18n";

/** First tab stop on every page. Each page shell's <main> carries id="main-content". */
export function SkipLink() {
  const { lang } = useLang();
  return (
    <a
      href="#main-content"
      className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-md focus:bg-background focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:shadow-lg"
    >
      {t("common", "skipToContent", lang)}
    </a>
  );
}
