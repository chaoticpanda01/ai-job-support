"use client";

import { useLang } from "@/lib/language-context";
import { t } from "@/lib/i18n";
import type { VisaConsultationListItem } from "@/types/api";

export function VisaPastConsultations({
  list,
  currentId,
}: {
  list: VisaConsultationListItem[];
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
                {new Date(c.created_at).toLocaleDateString(lang, {
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
