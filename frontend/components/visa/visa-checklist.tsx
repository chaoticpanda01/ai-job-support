"use client";

import { useEffect, useRef, useState } from "react";
import { useUpdateProgress } from "@/hooks/useVisa";
import { useLang } from "@/lib/language-context";
import { t } from "@/lib/i18n";
import type { VisaChecklistStep, VisaRoadmap } from "@/types/api";

const SAVE_DEBOUNCE_MS = 600;

export function VisaChecklistView({ roadmap }: { roadmap: VisaRoadmap }) {
  const { lang } = useLang();
  const [openPhase, setOpenPhase] = useState<number>(0);
  const [completed, setCompleted] = useState<Set<string>>(
    () => new Set(roadmap.completed_steps),
  );
  const [saveFailed, setSaveFailed] = useState(false);
  const updateProgress = useUpdateProgress();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The last state we know the server actually persisted — rollback target
  // on save failure. Only ever advanced by a successful save or a genuine
  // roadmap switch, never by an in-flight local toggle.
  const confirmedRef = useRef<Set<string>>(new Set(roadmap.completed_steps));
  const roadmapIdRef = useRef<string>(roadmap.id);

  // Switching roadmaps re-seeds local state from the newly shown one. Gated
  // on roadmap.id (not roadmap.completed_steps) so a background refetch of
  // the *same* roadmap — which hands back a new array reference — can't
  // clobber an in-flight, not-yet-saved toggle with stale server data.
  useEffect(() => {
    if (roadmapIdRef.current !== roadmap.id) {
      roadmapIdRef.current = roadmap.id;
      const seed = new Set(roadmap.completed_steps);
      setCompleted(seed);
      confirmedRef.current = seed;
      setSaveFailed(false);
    }
  }, [roadmap.id, roadmap.completed_steps]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  function toggleStep(stepId: string) {
    // Optimistic: flip immediately, persist on a trailing debounce. Nobody
    // should watch a spinner to tick a checkbox.
    const next = new Set(completed);
    if (next.has(stepId)) next.delete(stepId);
    else next.add(stepId);
    setCompleted(next);
    setSaveFailed(false);

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      updateProgress.mutate(
        { roadmapId: roadmap.id, completedSteps: Array.from(next) },
        {
          onSuccess: () => {
            confirmedRef.current = next;
          },
          onError: () => {
            setCompleted(new Set(confirmedRef.current));
            setSaveFailed(true);
          },
        },
      );
    }, SAVE_DEBOUNCE_MS);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">{t("visa", "yourRoadmap", lang)}</p>
        {saveFailed && (
          <p className="text-xs text-destructive">{t("visa", "progressSaveFail", lang)}</p>
        )}
      </div>

      {roadmap.checklist.phases.map((phase, idx) => {
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
                <PhaseNumber index={idx} done={totalCount > 0 && doneCount === totalCount} />
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
