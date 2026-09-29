"use client";

import { Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useLang } from "@/lib/language-context";
import { t } from "@/lib/i18n";
import { DOCUMENT_STATUS_TONE } from "@/lib/tones";
import type { DocumentStatus } from "@/types/api";

const LABEL_KEYS: Record<DocumentStatus, string> = {
  pending: "statusPending",
  processing: "statusProcessing",
  completed: "statusCompleted",
  failed: "statusFailed",
};

/** A generated document's status, shared by the Documents list and detail pages. */
export function DocumentStatusBadge({ status }: { status: DocumentStatus }) {
  const { lang } = useLang();
  return (
    <Badge variant={DOCUMENT_STATUS_TONE[status]}>
      {status === "processing" && (
        <Loader2 aria-hidden="true" className="h-3 w-3 animate-spin motion-reduce:animate-none" />
      )}
      {t("documents", LABEL_KEYS[status], lang)}
    </Badge>
  );
}
