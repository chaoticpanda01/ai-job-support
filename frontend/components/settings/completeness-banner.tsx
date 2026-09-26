"use client";

import { fieldId, missingFieldLabel } from "@/lib/rirekisho-completeness";
import { t, type Language } from "@/lib/i18n";

function focusField(key: string) {
  const el = document.getElementById(fieldId(key));
  if (el) {
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.focus({ preventScroll: true });
  }
}

/** What the 履歴書 still needs, each item a link to its field. */
export function CompletenessBanner({
  missingKeys,
  lang,
}: {
  missingKeys: string[];
  lang: Language;
}) {
  if (missingKeys.length === 0) {
    return (
      <p className="rounded-lg bg-success-soft px-4 py-3 text-sm font-medium text-success">
        {t("settings", "rirekishoReady", lang)}
      </p>
    );
  }
  const heading =
    missingKeys.length === 1
      ? t("settings", "rirekishoNeedsOne", lang)
      : t("settings", "rirekishoNeedsMany", lang).replace("{n}", String(missingKeys.length));
  return (
    <div className="rounded-lg bg-warning-soft px-4 py-3 text-sm text-warning">
      <p className="font-semibold">{heading}</p>
      <p className="mt-1 flex flex-wrap gap-x-1">
        {missingKeys.map((key, index) => (
          <span key={key}>
            <button
              type="button"
              onClick={() => focusField(key)}
              className="rounded font-medium text-indigo underline underline-offset-2 hover:no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {missingFieldLabel(key, lang)}
            </button>
            {index < missingKeys.length - 1 ? t("nav", "countSep", lang) : ""}
          </span>
        ))}
      </p>
    </div>
  );
}
