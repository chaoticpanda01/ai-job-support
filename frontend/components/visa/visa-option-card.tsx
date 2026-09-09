"use client";

import { useLang } from "@/lib/language-context";
import { t } from "@/lib/i18n";
import type { VisaEligibility, VisaOption } from "@/types/api";

const ELIGIBILITY_STYLES: Record<VisaEligibility, string> = {
  eligible: "bg-green-100 text-green-700",
  eligible_with_gaps: "bg-amber-100 text-amber-700",
  not_eligible: "bg-muted text-muted-foreground",
};

const ELIGIBILITY_LABEL_KEYS: Record<VisaEligibility, string> = {
  eligible: "eligible",
  eligible_with_gaps: "eligibleWithGaps",
  not_eligible: "notEligible",
};

export function VisaOptionCard({
  option,
  hasRoadmap,
  isBuilding,
  onSelect,
}: {
  option: VisaOption;
  hasRoadmap: boolean;
  isBuilding: boolean;
  onSelect: () => void;
}) {
  const { lang } = useLang();
  const buttonText = isBuilding
    ? t("visa", "building", lang)
    : hasRoadmap
      ? t("visa", "viewRoadmap", lang)
      : t("visa", "buildRoadmap", lang);

  return (
    <div
      className={`rounded-lg border bg-card p-5 ${
        option.recommended ? "border-primary ring-1 ring-primary/30" : ""
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold">{option.visa_type}</p>
            {option.recommended && (
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                {t("visa", "recommendedBadge", lang)}
              </span>
            )}
          </div>
          <span
            className={`mt-2 inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
              ELIGIBILITY_STYLES[option.eligibility]
            }`}
          >
            {t("visa", ELIGIBILITY_LABEL_KEYS[option.eligibility], lang)}
          </span>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-xs text-muted-foreground">{t("visa", "estimatedTime", lang)}</p>
          <p className="text-sm font-medium tabular-nums">
            {option.estimated_months} {t("visa", "months", lang)}
          </p>
        </div>
      </div>

      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{option.summary}</p>

      {option.key_requirements.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-medium text-muted-foreground">
            {t("visa", "requirements", lang)}
          </p>
          <ul className="mt-1 space-y-0.5">
            {option.key_requirements.map((req, i) => (
              <li key={i} className="text-xs text-foreground">
                • {req}
              </li>
            ))}
          </ul>
        </div>
      )}

      {option.gaps.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-medium text-amber-700">{t("visa", "gaps", lang)}</p>
          <ul className="mt-1 space-y-0.5">
            {option.gaps.map((gap, i) => (
              <li key={i} className="text-xs text-muted-foreground">
                • {gap}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-4 flex items-center gap-3">
        <button
          onClick={onSelect}
          disabled={isBuilding}
          aria-label={`${buttonText} — ${option.visa_type}`}
          className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {buttonText}
        </button>
        {!hasRoadmap && !isBuilding && (
          <span className="text-xs text-muted-foreground">
            {t("visa", "buildRoadmapHint", lang)}
          </span>
        )}
      </div>
    </div>
  );
}
