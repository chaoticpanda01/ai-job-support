"use client";

import { useState } from "react";
import { Stamp } from "lucide-react";
import { RetryButton } from "@/components/retry-button";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
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
  const {
    data: latest,
    isLoading,
    isFetching,
    error,
    errorUpdateCount,
    refetch,
  } = useLatestVisaConsultation();
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
    <>
      <PageHeader
        eyebrow={t("nav", "groupSettleIn", lang)}
        title={t("visa", "title", lang)}
        description={t("visa", "sub", lang)}
        actions={
          <Button
            onClick={() => {
              setViewingVisaType(null);
              setAnnouncement(t("visa", "assessing", lang));
              assess.mutate(undefined, {
                onSuccess: () => setAnnouncement(t("visa", "assessmentReady", lang)),
                onError: () => setAnnouncement(""),
              });
            }}
            disabled={isLoading}
            loading={assess.isPending}
          >
            {isLoading ? (
              // Assess or Re-assess isn't known until the latest assessment is.
              <Skeleton className="h-4 w-24 bg-primary-foreground/30" />
            ) : assess.isPending ? (
              t("visa", "assessing", lang)
            ) : latest ? (
              t("visa", "reassessBtn", lang)
            ) : (
              t("visa", "assessBtn", lang)
            )}
          </Button>
        }
      />
      <div className="space-y-8">
        <LiveAnnouncer message={announcement} />

        {assess.error && (
          <Alert>
            {/* 422 here means the account has no profile yet, not that a field
              is wrong -- this control has no fields. */}
            {apiErrorMessage(assess.error, lang, {
              422: t("visa", "assessNeedsProfile", lang),
            })}
          </Alert>
        )}

        {selectRoadmap.error && (
          <Alert>
            {/* 422 here means the chosen option isn't part of the latest
              assessment, usually because a newer one replaced it. */}
            {apiErrorMessage(selectRoadmap.error, lang, {
              422: t("visa", "roadmapOptionStale", lang),
            })}
          </Alert>
        )}

        {loadFailed && !assess.isPending && (
          <Alert
            announceKey={errorUpdateCount}
            action={<RetryButton retrying={isFetching} onRetry={() => void refetch()} />}
          >
            {t("visa", "loadFail", lang)}
          </Alert>
        )}

        {isLoading && <RoadmapSkeleton />}

        {noConsultation && !assess.isPending && (
          <EmptyState
            icon={Stamp}
            title={t("visa", "noAssessment", lang)}
            description={t("visa", "noAssessmentSub", lang)}
          />
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
    </>
  );
}

function RoadmapSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-16 rounded-lg" />
      <Skeleton className="h-24 rounded-lg" />
      {Array.from({ length: 3 }).map((_, i) => (
        <Skeleton key={i} className="h-14 rounded-lg" />
      ))}
    </div>
  );
}
