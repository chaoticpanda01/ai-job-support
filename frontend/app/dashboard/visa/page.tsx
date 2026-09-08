"use client";

import { useState } from "react";
import { VisaOptionsList } from "@/components/visa/visa-options-list";
import { VisaPastConsultations } from "@/components/visa/visa-past-consultations";
import { VisaRoadmapSwitcher } from "@/components/visa/visa-roadmap-switcher";
import { VisaRoadmapView } from "@/components/visa/visa-roadmap-view";
import {
  useAssessVisa,
  useLatestVisaConsultation,
  useSelectRoadmap,
  useVisaConsultations,
} from "@/hooks/useVisa";
import { useLang } from "@/lib/language-context";
import { t } from "@/lib/i18n";

export default function VisaPage() {
  const { data: latest, isLoading, error } = useLatestVisaConsultation();
  const { data: list } = useVisaConsultations();
  const assess = useAssessVisa();
  const selectRoadmap = useSelectRoadmap(latest?.id);
  const { lang } = useLang();

  // null = show the options list. A visa_type = show that roadmap.
  const [viewingVisaType, setViewingVisaType] = useState<string | null>(null);

  const noConsultation = !isLoading && (error as { status?: number } | null)?.status === 404;
  const roadmaps = latest?.roadmaps ?? [];
  const viewing = roadmaps.find((r) => r.visa_type === viewingVisaType) ?? null;

  function handleSelect(visaType: string) {
    // Generate-or-return lives on the server; the client just says which visa.
    selectRoadmap.mutate(visaType, {
      onSuccess: (roadmap) => setViewingVisaType(roadmap.visa_type),
    });
  }

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{t("visa", "title", lang)}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("visa", "sub", lang)}</p>
        </div>
        <button
          onClick={() => {
            setViewingVisaType(null);
            assess.mutate();
          }}
          disabled={assess.isPending}
          className="shrink-0 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {assess.isPending ? (
            <span className="flex items-center gap-2">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
              {t("visa", "assessing", lang)}
            </span>
          ) : latest ? (
            t("visa", "reassessBtn", lang)
          ) : (
            t("visa", "assessBtn", lang)
          )}
        </button>
      </div>

      {assess.error && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {(assess.error as { detail?: string }).detail ?? t("visa", "assessFail", lang)}
        </p>
      )}

      {selectRoadmap.error && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {(selectRoadmap.error as { detail?: string }).detail ?? t("visa", "buildFail", lang)}
        </p>
      )}

      {isLoading && <RoadmapSkeleton />}

      {noConsultation && !assess.isPending && (
        <div className="rounded-lg border border-dashed p-10 text-center">
          <p className="text-sm text-muted-foreground">{t("visa", "noAssessment", lang)}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("visa", "noAssessmentSub", lang)}
          </p>
        </div>
      )}

      {latest && viewing && (
        <div className="space-y-6">
          <VisaRoadmapSwitcher
            roadmaps={roadmaps}
            activeId={viewing.id}
            onSelect={handleSelect}
            onBack={() => setViewingVisaType(null)}
          />
          <VisaRoadmapView roadmap={viewing} />
        </div>
      )}

      {latest && !viewing && latest.options.length > 0 && (
        <VisaOptionsList
          options={latest.options}
          roadmaps={roadmaps}
          buildingVisaType={selectRoadmap.isPending ? selectRoadmap.variables ?? null : null}
          onSelect={handleSelect}
        />
      )}

      {/* Consultations created before multi-roadmap support have no options —
          fall back to the checklist stored on the row itself. */}
      {latest && !viewing && latest.options.length === 0 && latest.checklist && (
        <VisaRoadmapView
          roadmap={{
            id: latest.id,
            visa_type: latest.visa_type ?? "—",
            ai_guidance: latest.ai_guidance,
            checklist: latest.checklist,
            completed_steps: [],
            created_at: latest.created_at,
            updated_at: latest.updated_at,
          }}
        />
      )}

      {list && list.length > 1 && (
        <VisaPastConsultations list={list} currentId={latest?.id} />
      )}
    </div>
  );
}

function RoadmapSkeleton() {
  return (
    <div className="space-y-4">
      <div className="h-16 animate-pulse rounded-lg bg-muted" />
      <div className="h-24 animate-pulse rounded-lg bg-muted" />
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="h-14 animate-pulse rounded-lg bg-muted" />
      ))}
    </div>
  );
}
