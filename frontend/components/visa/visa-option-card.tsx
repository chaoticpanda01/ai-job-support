"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useLang } from "@/lib/language-context";
import { t } from "@/lib/i18n";
import { ELIGIBILITY_TONE } from "@/lib/tones";
import { cn } from "@/lib/utils";
import type { VisaEligibility, VisaOption } from "@/types/api";

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
    <Card className={cn("p-5", option.recommended && "border-primary ring-1 ring-ring/30")}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold">{option.visa_type}</p>
            {option.recommended && (
              <Badge variant="info">{t("visa", "recommendedBadge", lang)}</Badge>
            )}
          </div>
          <Badge variant={ELIGIBILITY_TONE[option.eligibility]} className="mt-2">
            {t("visa", ELIGIBILITY_LABEL_KEYS[option.eligibility], lang)}
          </Badge>
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
          <p className="text-xs font-medium text-warning">{t("visa", "gaps", lang)}</p>
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
        <Button
          onClick={onSelect}
          loading={isBuilding}
          aria-label={`${buttonText} — ${option.visa_type}`}
        >
          {buttonText}
        </Button>
        {!hasRoadmap && !isBuilding && (
          <span className="text-xs text-muted-foreground">
            {t("visa", "buildRoadmapHint", lang)}
          </span>
        )}
      </div>
    </Card>
  );
}
