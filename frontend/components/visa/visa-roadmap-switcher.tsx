"use client";

import { useLang } from "@/lib/language-context";
import { t } from "@/lib/i18n";
import type { VisaRoadmap } from "@/types/api";

export function VisaRoadmapSwitcher({
  roadmaps,
  activeId,
  switchingVisaType,
  onSelect,
  onBack,
}: {
  roadmaps: VisaRoadmap[];
  activeId: string | null;
  switchingVisaType?: string | null;
  onSelect: (visaType: string) => void;
  onBack: () => void;
}) {
  const { lang } = useLang();
  // Roadmaps come back in whatever order the query cache was last updated
  // in (most-recently-selected last) — sort by creation so tabs don't
  // reorder themselves as the user switches between them.
  const ordered = [...roadmaps].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        onClick={onBack}
        className="rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-accent"
      >
        ← {t("visa", "backToOptions", lang)}
      </button>

      {ordered.length > 1 && (
        <>
          <span className="ml-2 text-xs text-muted-foreground">
            {t("visa", "switchRoadmap", lang)}:
          </span>
          {ordered.map((roadmap) => {
            const isSwitching = roadmap.visa_type === switchingVisaType;
            return (
              <button
                key={roadmap.id}
                onClick={() => onSelect(roadmap.visa_type)}
                disabled={isSwitching}
                aria-current={roadmap.id === activeId ? "true" : undefined}
                className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs disabled:opacity-50 ${
                  roadmap.id === activeId
                    ? "border-primary bg-primary/10 font-medium text-primary"
                    : "hover:bg-accent"
                }`}
              >
                {isSwitching && (
                  <span className="h-2 w-2 animate-spin rounded-full border border-current border-t-transparent" />
                )}
                {roadmap.visa_type}
              </button>
            );
          })}
        </>
      )}
    </div>
  );
}
