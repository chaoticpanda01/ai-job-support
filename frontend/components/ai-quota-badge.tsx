"use client";

import { useAiQuota } from "@/hooks/useAiQuota";
import { useLang } from "@/lib/language-context";
import { t, type Language } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/** At or below this many remaining calls the badge turns amber. */
const LOW_REMAINING = 2;

/**
 * Render a reset countdown in the active language.
 *
 * Deliberately does not reuse the backend's _format_duration, which emits
 * English-only prose. Pure, single-consumer, so it stays in this file rather
 * than becoming a shared utility.
 */
function formatReset(seconds: number, lang: Language): string {
  const totalMinutes = Math.ceil(seconds / 60);
  if (totalMinutes < 1) return t("aiQuota", "soon", lang);

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const h = t("aiQuota", "hourUnit", lang);
  const m = t("aiQuota", "minuteUnit", lang);

  if (hours === 0) return `${minutes}${m}`;
  if (minutes === 0) return `${hours}${h}`;
  return `${hours}${h}${minutes}${m}`;
}

/**
 * Remaining AI calls, shown in the dashboard header.
 *
 * Advisory only. This sits in the header of every dashboard page, so a pending
 * or failed quota fetch renders nothing rather than risking the header. The
 * authoritative path is unaffected either way — an exhausted quota is still
 * enforced by check_budget and surfaced as a 429.
 */
export function AiQuotaBadge() {
  const { lang } = useLang();
  const { data } = useAiQuota();

  if (!data) return null;

  const { remaining, limit, exhausted, scope, resets_in_seconds } = data;
  const low = !exhausted && remaining <= LOW_REMAINING;
  const reset = formatReset(resets_in_seconds, lang);

  const scopeLabel = t("aiQuota", scope === "global" ? "sharedPool" : "yourQuota", lang);
  const description = exhausted
    ? `${scopeLabel}: ${t("aiQuota", "exhausted", lang)} ${t("aiQuota", "resetsIn", lang)} ${reset}`
    : `${scopeLabel}: ${remaining} ${t("aiQuota", "left", lang)}`;

  return (
    <span
      title={description}
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium tabular-nums",
        exhausted
          ? "border-destructive/40 text-destructive"
          : low
            ? "border-amber-500/40 text-amber-700"
            : "border-transparent text-muted-foreground",
      )}
    >
      <span aria-hidden="true">⚡</span>
      <span aria-hidden="true">
        {remaining}/{limit}
        {exhausted ? ` · ${reset}` : ""}
      </span>
      <span className="sr-only">{description}</span>
    </span>
  );
}
