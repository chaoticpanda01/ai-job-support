"use client";

import { VisaOptionCard } from "@/components/visa/visa-option-card";
import { useLang } from "@/lib/language-context";
import { t } from "@/lib/i18n";
import type { VisaOption, VisaRoadmap } from "@/types/api";

export function VisaOptionsList({
  options,
  roadmaps,
  buildingVisaType,
  onSelect,
}: {
  options: VisaOption[];
  roadmaps: VisaRoadmap[];
  buildingVisaType: string | null;
  onSelect: (visaType: string) => void;
}) {
  const { lang } = useLang();
  const builtTypes = new Set(roadmaps.map((r) => r.visa_type));
  // The AI is told to order best-first, but never trust that for the
  // recommended one — pin it to the top explicitly.
  const ordered = [...options].sort(
    (a, b) => Number(b.recommended) - Number(a.recommended),
  );

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium">{t("visa", "yourOptions", lang)}</p>
      <div className="grid gap-3 lg:grid-cols-2">
        {ordered.map((option) => (
          <VisaOptionCard
            key={option.visa_type}
            option={option}
            hasRoadmap={builtTypes.has(option.visa_type)}
            isBuilding={buildingVisaType === option.visa_type}
            onSelect={() => onSelect(option.visa_type)}
          />
        ))}
      </div>
    </div>
  );
}
