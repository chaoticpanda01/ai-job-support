"use client";

import { useState } from "react";
import { useGenerateVisa, useLatestVisaConsultation, useVisaConsultations } from "@/hooks/useVisa";
import { useLang } from "@/lib/language-context";
import { t } from "@/lib/i18n";
import type { VisaChecklist, VisaChecklistStep, VisaConsultation } from "@/types/api";

export default function VisaPage() {
  const { data: latest, isLoading, error } = useLatestVisaConsultation();
  const { data: list } = useVisaConsultations();
  const generate = useGenerateVisa();
  const { lang } = useLang();

  const noConsultation = !isLoading && (error as { status?: number } | null)?.status === 404;

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{t("visa", "title", lang)}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("visa", "sub", lang)}</p>
        </div>
        <button
          onClick={() => generate.mutate()}
          disabled={generate.isPending}
          className="shrink-0 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {generate.isPending ? (
            <span className="flex items-center gap-2">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
              {t("visa", "generating", lang)}
            </span>
          ) : (
            t("visa", "generateBtn", lang)
          )}
        </button>
      </div>

      {generate.error && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {(generate.error as { detail?: string }).detail ?? t("visa", "generateFail", lang)}
        </p>
      )}

      {isLoading && <RoadmapSkeleton />}

      {noConsultation && !generate.isPending && (
        <div className="rounded-lg border border-dashed p-10 text-center">
          <p className="text-sm text-muted-foreground">{t("visa", "noRoadmap", lang)}</p>
          <p className="mt-1 text-sm text-muted-foreground">{t("visa", "noRoadmapSub", lang)}</p>
        </div>
      )}

      {latest && <RoadmapView consultation={latest} />}

      {list && list.length > 1 && <PastConsultations list={list} currentId={latest?.id} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Full roadmap view
// ---------------------------------------------------------------------------

function RoadmapView({ consultation: c }: { consultation: VisaConsultation }) {
  const { lang } = useLang();
  return (
    <div className="space-y-6">
      <div className="rounded-lg border bg-primary/5 px-5 py-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t("visa", "recommendedVisa", lang)}
        </p>
        <p className="mt-1 text-lg font-semibold">{c.visa_type ?? "—"}</p>
      </div>

      {c.ai_guidance && (
        <div className="rounded-lg border bg-card p-5">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t("visa", "guidance", lang)}
          </p>
          <p className="text-sm leading-relaxed text-foreground">{c.ai_guidance}</p>
        </div>
      )}

      {c.checklist && <ChecklistView checklist={c.checklist} />}

      <p className="text-right text-xs text-muted-foreground">
        {t("visa", "generated", lang)}{" "}
        {new Date(c.created_at).toLocaleDateString(undefined, {
          day: "numeric",
          month: "short",
          year: "numeric",
        })}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Phase accordion
// ---------------------------------------------------------------------------

function ChecklistView({ checklist }: { checklist: VisaChecklist }) {
  const { lang } = useLang();
  const [openPhase, setOpenPhase] = useState<number>(0);
  const [completed, setCompleted] = useState<Set<string>>(new Set());

  function toggleStep(stepId: string) {
    setCompleted((prev) => {
      const next = new Set(prev);
      if (next.has(stepId)) {
        next.delete(stepId);
      } else {
        next.add(stepId);
      }
      return next;
    });
  }

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium">{t("visa", "yourRoadmap", lang)}</p>
      {checklist.phases.map((phase, idx) => {
        const isOpen = openPhase === idx;
        const doneCount = phase.steps.filter((s) => completed.has(s.id)).length;
        const totalCount = phase.steps.length;

        return (
          <div key={idx} className="overflow-hidden rounded-lg border bg-card">
            <button
              onClick={() => setOpenPhase(isOpen ? -1 : idx)}
              className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-accent"
            >
              <div className="flex items-center gap-3">
                <PhaseNumber index={idx} done={doneCount === totalCount} />
                <div>
                  <p className="text-sm font-medium">{phase.phase}</p>
                  <p className="text-xs text-muted-foreground">{phase.description}</p>
                </div>
              </div>
              <div className="ml-4 flex shrink-0 items-center gap-3">
                <span className="text-xs tabular-nums text-muted-foreground">
                  {doneCount}/{totalCount}
                </span>
                <span className="text-muted-foreground">{isOpen ? "▲" : "▼"}</span>
              </div>
            </button>

            {isOpen && (
              <ul className="divide-y border-t">
                {phase.steps.map((step) => (
                  <StepRow
                    key={step.id}
                    step={step}
                    checked={completed.has(step.id)}
                    onToggle={() => toggleStep(step.id)}
                  />
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}

function PhaseNumber({ index, done }: { index: number; done: boolean }) {
  return (
    <span
      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
        done ? "bg-green-100 text-green-700" : "bg-primary/10 text-primary"
      }`}
    >
      {done ? "✓" : index + 1}
    </span>
  );
}

function StepRow({
  step,
  checked,
  onToggle,
}: {
  step: VisaChecklistStep;
  checked: boolean;
  onToggle: () => void;
}) {
  const { lang } = useLang();
  const [expanded, setExpanded] = useState(false);

  return (
    <li className={`px-4 py-3 text-sm ${checked ? "opacity-60" : ""}`}>
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={checked}
          onChange={onToggle}
          className="mt-0.5 h-4 w-4 shrink-0 accent-primary"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className={`font-medium ${checked ? "line-through" : ""}`}>{step.title}</p>
            {!step.required && (
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                {t("visa", "optional", lang)}
              </span>
            )}
            {step.estimated_weeks > 0 && (
              <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                ~{step.estimated_weeks}w
              </span>
            )}
          </div>

          {!checked && (
            <>
              <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{step.detail}</p>
              {(step.resources.length > 0 || step.detail.length > 120) && (
                <button
                  onClick={() => setExpanded((v) => !v)}
                  className="mt-1 text-xs text-primary hover:underline"
                >
                  {expanded ? t("visa", "showLess", lang) : t("visa", "showMore", lang)}
                </button>
              )}
              {expanded && (
                <div className="mt-2 space-y-1.5">
                  <p className="text-xs text-foreground">{step.detail}</p>
                  {step.resources.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground">
                        {t("visa", "resources", lang)}
                      </p>
                      <ul className="mt-0.5 space-y-0.5">
                        {step.resources.map((r, i) => (
                          <li key={i} className="text-xs text-muted-foreground">
                            • {r}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Past consultations list
// ---------------------------------------------------------------------------

function PastConsultations({
  list,
  currentId,
}: {
  list: { id: string; visa_type: string | null; created_at: string }[];
  currentId: string | undefined;
}) {
  const { lang } = useLang();

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-muted-foreground">
        {t("visa", "previousRoadmaps", lang)}
      </p>
      <ul className="space-y-1.5">
        {list
          .filter((c) => c.id !== currentId)
          .map((c) => (
            <li
              key={c.id}
              className="flex items-center justify-between rounded-md border bg-card px-4 py-2.5 text-sm"
            >
              <span className="text-muted-foreground">{c.visa_type ?? "—"}</span>
              <span className="text-xs text-muted-foreground">
                {new Date(c.created_at).toLocaleDateString(undefined, {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
              </span>
            </li>
          ))}
      </ul>
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
