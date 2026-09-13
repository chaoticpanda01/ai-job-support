"use client";

import { VisaChecklistView } from "@/components/visa/visa-checklist";
import { useLang } from "@/lib/language-context";
import { t } from "@/lib/i18n";
import type { VisaRoadmap } from "@/types/api";

export function VisaRoadmapView({
  roadmap,
  readOnly = false,
}: {
  roadmap: VisaRoadmap;
  readOnly?: boolean;
}) {
  const { lang } = useLang();

  return (
    <div className="space-y-6">
      <div className="rounded-lg border bg-primary/5 px-5 py-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t("visa", "recommendedVisa", lang)}
        </p>
        <p className="mt-1 text-lg font-semibold">{roadmap.visa_type}</p>
      </div>

      {roadmap.ai_guidance && (
        <div className="rounded-lg border bg-card p-5">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t("visa", "guidance", lang)}
          </p>
          <p className="text-sm leading-relaxed text-foreground">{roadmap.ai_guidance}</p>
        </div>
      )}

      <VisaChecklistView roadmap={roadmap} readOnly={readOnly} />

      <p className="text-right text-xs text-muted-foreground">
        {t("visa", "generated", lang)}{" "}
        {new Date(roadmap.created_at).toLocaleDateString(lang, {
          day: "numeric",
          month: "short",
          year: "numeric",
        })}
      </p>
    </div>
  );
}
