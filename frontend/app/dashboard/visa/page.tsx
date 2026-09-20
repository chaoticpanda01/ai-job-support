"use client";

import { useState } from "react";
import { VisaOptionsList } from "@/components/visa/visa-options-list";
import { VisaPastConsultations } from "@/components/visa/visa-past-consultations";
import { VisaRoadmapSwitcher } from "@/components/visa/visa-roadmap-switcher";
import { VisaRoadmapView } from "@/components/visa/visa-roadmap-view";
import { LiveAnnouncer } from "@/components/live-announcer";
import {
  useAssessVisa,
  useLatestVisaConsultation,
  useSelectRoadmap,
  useVisaConsultations,
} from "@/hooks/useVisa";
import { apiErrorMessage } from "@/lib/api-error";
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
  // Set from mutation callbacks rather than derived from mutation flags. assess
  // and selectRoadmap each keep isSuccess true after their call, so derived
  // text can't tell which action finished last: going back from a roadmap to
  // the options list would re-announce the older assessment as new.
  const [announcement, setAnnouncement] = useState("");

  // A 404 means no consultation yet. Any other error means the lookup itself
  // failed, which must be shown rather than rendering nothing.
  const errorStatus = (error as { status?: number } | null)?.status;
  const noConsultation = !isLoading && errorStatus === 404;
  const loadFailed = !isLoading && Boolean(error) && errorStatus !== 404;
  const roadmaps = latest?.roadmaps ?? [];
  const viewing = roadmaps.find((r) => r.visa_type === viewingVisaType) ?? null;

  function handleSelect(visaType: string) {
    // Generate-or-return lives on the server; the client just says which visa.
    setAnnouncement(t("visa", "building", lang));
    selectRoadmap.mutate(visaType, {
      onSuccess: (roadmap) => {
        setViewingVisaType(roadmap.visa_type);
        setAnnouncement(t("visa", "roadmapReady", lang));
      },
      onError: () => setAnnouncement(""),
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
            setAnnouncement(t("visa", "assessing", lang));
            assess.mutate(undefined, {
              onSuccess: () => setAnnouncement(t("visa", "assessmentReady", lang)),
              onError: () => setAnnouncement(""),
            });
          }}
          disabled={assess.isPending || isLoading}
          className="shrink-0 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {assess.isPending ? (
            <span className="flex items-center gap-2">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
              {t("visa", "assessing", lang)}
            </span>
          ) : isLoading ? (
            <span className="block h-4 w-24 animate-pulse rounded bg-primary-foreground/30" />
          ) : latest ? (
            t("visa", "reassessBtn", lang)
          ) : (
            t("visa", "assessBtn", lang)
          )}
        </button>
      </div>

      <LiveAnnouncer message={announcement} />

      {assess.error && (
        <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {/* 422 here means the account has no profile yet, not that a field
              is wrong -- this control has no fields. */}
          {apiErrorMessage(assess.error, lang, {
            422: t("visa", "assessNeedsProfile", lang),
          })}
        </p>
      )}

      {selectRoadmap.error && (
        <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {/* 422 here means the chosen option isn't part of the latest
              assessment, usually because a newer one replaced it. */}
          {apiErrorMessage(selectRoadmap.error, lang, {
            422: t("visa", "roadmapOptionStale", lang),
          })}
        </p>
      )}

      {loadFailed && !assess.isPending && (
        <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {t("visa", "loadFail", lang)}
        </p>
      )}

      {isLoading && <RoadmapSkeleton />}

      {noConsultation && !assess.isPending && (
        <div className="rounded-lg border border-dashed p-10 text-center">
          <p className="text-sm text-muted-foreground">{t("visa", "noAssessment", lang)}</p>
          <p className="mt-1 text-sm text-muted-foreground">{t("visa", "noAssessmentSub", lang)}</p>
        </div>
      )}

      {latest && viewing && (
        <div className="space-y-6">
          <VisaRoadmapSwitcher
            roadmaps={roadmaps}
            activeId={viewing.id}
            switchingVisaType={selectRoadmap.isPending ? (selectRoadmap.variables ?? null) : null}
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
          buildingVisaType={selectRoadmap.isPending ? (selectRoadmap.variables ?? null) : null}
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
          // This is a synthetic roadmap keyed on the CONSULTATION's id — no
          // roadmap row exists to save progress to. Interactive checkboxes
          // here would always 404 and revert. Read-only until the user
          // re-assesses into the real multi-roadmap flow.
          readOnly
        />
      )}

      {list && list.length > 1 && <VisaPastConsultations list={list} currentId={latest?.id} />}
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
