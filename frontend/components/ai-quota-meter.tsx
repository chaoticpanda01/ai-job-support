"use client";

import { Zap } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { useAiQuota } from "@/hooks/useAiQuota";
import { useLang } from "@/lib/language-context";
import { t, type Language } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/** At or below this many remaining calls the count turns ochre. */
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
 * Remaining AI calls, in the sidebar footer.
 *
 * Advisory only. It sits on every dashboard page, so a pending or failed quota
 * fetch renders nothing rather than risking the shell. The authoritative path
 * is unaffected either way: an exhausted quota is still enforced by
 * check_budget and surfaced as a 429.
 */
export function AiQuotaMeter() {
  const { lang } = useLang();
  const { data } = useAiQuota();

  if (!data) return null;

  const { remaining, limit, exhausted, scope, resets_in_seconds } = data;
  const low = !exhausted && remaining <= LOW_REMAINING;
  const reset = formatReset(resets_in_seconds, lang);

  // Japanese sets no space between clauses or between a number and its
  // counter, so the separator is itself translated rather than a literal " ".
  const sep = t("aiQuota", "sep", lang);
  const scopeLabel = t("aiQuota", scope === "global" ? "sharedPool" : "yourQuota", lang);
  const description = exhausted
    ? `${scopeLabel}: ${t("aiQuota", "exhausted", lang)}${sep}${t("aiQuota", "resetsIn", lang)}${sep}${reset}`
    : `${scopeLabel}: ${remaining}${sep}${t("aiQuota", "left", lang)}`;

  return (
    <div className="px-3 py-2" title={description}>
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="flex items-center gap-1.5 font-medium text-secondary-foreground">
          <Zap aria-hidden="true" className="h-3.5 w-3.5" />
          {t("aiQuota", "meterTitle", lang)}
        </span>
        <span
          aria-hidden="true"
          className={cn(
            "font-medium tabular-nums",
            exhausted ? "text-destructive" : low ? "text-warning" : "text-muted-foreground",
          )}
        >
          {remaining}/{limit}
          {exhausted ? ` · ${reset}` : ""}
        </span>
      </div>
      <Progress value={remaining} max={limit} aria-label={description} className="mt-1.5 h-1" />
    </div>
  );
}
