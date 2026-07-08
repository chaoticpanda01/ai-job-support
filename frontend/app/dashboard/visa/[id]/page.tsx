"use client";

import { use } from "react";
import { useVisaConsultation } from "@/hooks/useVisa";
import { Breadcrumbs } from "@/components/breadcrumbs";
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
        <div className="h-4 w-24 animate-pulse rounded bg-muted" />
        <div className="h-16 animate-pulse rounded-lg bg-muted" />
        <div className="h-24 animate-pulse rounded-lg bg-muted" />
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-14 animate-pulse rounded-lg bg-muted" />
        ))}
      </div>
    );
  }

  if (error || !consultation) {
    return (
      <div className="space-y-4">
        <Breadcrumbs items={[{ label: t("visa", "title", lang), href: "/dashboard/visa" }]} />
        <p className="text-sm text-destructive">{t("visa", "consultNotFound", lang)}</p>
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

      <div>
        <h1 className="text-2xl font-semibold">{t("visa", "roadmapTitle", lang)}</h1>
        <p className="mt-1 text-xs text-muted-foreground">
          {t("visa", "generated", lang)}{" "}
          {new Date(consultation.created_at).toLocaleDateString(undefined, {
            day: "numeric",
            month: "long",
            year: "numeric",
          })}
        </p>
      </div>

      {/* Visa type banner */}
      <div className="rounded-lg border bg-primary/5 px-5 py-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t("visa", "recommendedVisa", lang)}
        </p>
        <p className="mt-1 text-lg font-semibold">{consultation.visa_type ?? "—"}</p>
      </div>

      {/* Guidance */}
      {consultation.ai_guidance && (
        <div className="rounded-lg border bg-card p-5">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t("visa", "guidance", lang)}
          </p>
          <p className="text-sm leading-relaxed">{consultation.ai_guidance}</p>
        </div>
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
        <div key={idx} className="overflow-hidden rounded-lg border bg-card">
          <div className="flex items-center gap-3 border-b bg-muted/30 px-4 py-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
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
        </div>
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
            {!step.required && (
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                {t("visa", "optional", lang)}
              </span>
            )}
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
