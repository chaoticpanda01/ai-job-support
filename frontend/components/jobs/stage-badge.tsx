"use client";

import { Badge } from "@/components/ui/badge";
import { useLang } from "@/lib/language-context";
import { STAGE_TONE, stageName } from "@/lib/pipeline";
import type { ApplicationStatus } from "@/types/api";

/** A job's pipeline stage, coloured by what it means. Closed ones name the reason. */
export function StageBadge({ status }: { status: ApplicationStatus }) {
  const { lang } = useLang();
  return <Badge variant={STAGE_TONE[status]}>{stageName(status, lang)}</Badge>;
}
