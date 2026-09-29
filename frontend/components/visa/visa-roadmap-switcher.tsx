"use client";

import { useLang } from "@/lib/language-context";
import { t } from "@/lib/i18n";
import type { VisaRoadmap } from "@/types/api";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

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
      <Button variant="secondary" size="sm" onClick={onBack}>
        <ArrowLeft aria-hidden="true" />
        {t("visa", "backToOptions", lang)}
      </Button>

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
                    ? "border-primary bg-indigo-soft font-medium text-indigo"
                    : "hover:bg-secondary"
                }`}
              >
                {isSwitching && (
                  <Loader2
                    aria-hidden="true"
                    className="h-3 w-3 animate-spin motion-reduce:animate-none"
                  />
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
