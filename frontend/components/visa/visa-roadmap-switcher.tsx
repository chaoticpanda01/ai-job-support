"use client";

import { useLang } from "@/lib/language-context";
import { t } from "@/lib/i18n";
import type { VisaRoadmap } from "@/types/api";

export function VisaRoadmapSwitcher({
  roadmaps,
  activeId,
  onSelect,
  onBack,
}: {
  roadmaps: VisaRoadmap[];
  activeId: string | null;
  onSelect: (visaType: string) => void;
  onBack: () => void;
}) {
  const { lang } = useLang();

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        onClick={onBack}
        className="rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-accent"
      >
        ← {t("visa", "backToOptions", lang)}
      </button>

      {roadmaps.length > 1 && (
        <>
          <span className="ml-2 text-xs text-muted-foreground">
            {t("visa", "switchRoadmap", lang)}:
          </span>
          {roadmaps.map((roadmap) => (
            <button
              key={roadmap.id}
              onClick={() => onSelect(roadmap.visa_type)}
              className={`rounded-md border px-3 py-1.5 text-xs ${
                roadmap.id === activeId
                  ? "border-primary bg-primary/10 font-medium text-primary"
                  : "hover:bg-accent"
              }`}
            >
              {roadmap.visa_type}
            </button>
          ))}
        </>
      )}
    </div>
  );
}
