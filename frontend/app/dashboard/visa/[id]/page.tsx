"use client";

import { use } from "react";
import { useVisaConsultation } from "@/hooks/useVisa";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { useLang } from "@/lib/language-context";
import { t } from "@/lib/i18n";
import type { VisaChecklist, VisaChecklistStep } from "@/types/api";

interface Props {
  params: Promise<{ id: string }>;
}

export default function VisaConsultationPage({ params }: Props) {
  const { id } = use(params);
  const { data: consultation, isLoading, error } = useVisaConsultation(id);
  const { lang } = useLang();

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-16 rounded-lg" />
        <Skeleton className="h-24 rounded-lg" />
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-14 rounded-lg" />
        ))}
      </div>
    );
  }

  if (error || !consultation) {
    return (
      <div className="space-y-4">
        <Breadcrumbs items={[{ label: t("visa", "title", lang), href: "/dashboard/visa" }]} />
        <Alert>{t("visa", "consultNotFound", lang)}</Alert>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: t("visa", "title", lang), href: "/dashboard/visa" },
          { label: t("visa", "roadmapTitle", lang) },
        ]}
      />

      <PageHeader
        className="mb-0"
        title={t("visa", "roadmapTitle", lang)}
        description={`${t("visa", "generated", lang)} ${new Date(
          consultation.created_at,
        ).toLocaleDateString(lang, { day: "numeric", month: "long", year: "numeric" })}`}
      />

      {/* Visa type banner */}
      <div className="rounded-lg border bg-indigo-soft px-5 py-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t("visa", "recommendedVisa", lang)}
        </p>
        <p className="mt-1 text-lg font-semibold">{consultation.visa_type ?? "—"}</p>
      </div>

      {/* Guidance */}
      {consultation.ai_guidance && (
        <Card className="p-5">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t("visa", "guidance", lang)}
          </p>
          <p className="text-sm leading-relaxed">{consultation.ai_guidance}</p>
        </Card>
      )}

      {/* Checklist phases (read-only) */}
      {consultation.checklist && (
        <ReadOnlyChecklist checklist={consultation.checklist as VisaChecklist} />
      )}
    </div>
  );
}

function ReadOnlyChecklist({ checklist }: { checklist: VisaChecklist }) {
  const { lang } = useLang();
  return (
    <div className="space-y-3">
      <p className="text-sm font-medium">{t("visa", "roadmapPhases", lang)}</p>
      {checklist.phases.map((phase, idx) => (
        <Card key={idx} className="overflow-hidden">
          <div className="flex items-center gap-3 border-b bg-muted/30 px-4 py-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-soft text-xs font-bold text-indigo">
              {idx + 1}
            </span>
            <div>
              <p className="text-sm font-medium">{phase.phase}</p>
              <p className="text-xs text-muted-foreground">{phase.description}</p>
            </div>
          </div>
          <ul className="divide-y">
            {phase.steps.map((step) => (
              <StepRow key={step.id} step={step} />
            ))}
          </ul>
        </Card>
      ))}
    </div>
  );
}

function StepRow({ step }: { step: VisaChecklistStep }) {
  const { lang } = useLang();
  return (
    <li className="px-4 py-3 text-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-medium">{step.title}</p>
            {!step.required && <Badge>{t("visa", "optional", lang)}</Badge>}
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">{step.detail}</p>
          {step.resources.length > 0 && (
            <ul className="mt-1.5 space-y-0.5">
              {step.resources.map((r, i) => (
                <li key={i} className="text-xs text-muted-foreground">
                  • {r}
                </li>
              ))}
            </ul>
          )}
        </div>
        {step.estimated_weeks > 0 && (
          <span className="shrink-0 text-xs text-muted-foreground">~{step.estimated_weeks}w</span>
        )}
      </div>
    </li>
  );
}
