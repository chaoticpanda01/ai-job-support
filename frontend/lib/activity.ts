import type { Route } from "next";
import type { Language } from "@/lib/i18n";
import { pickPrimaryResume, type JourneyInput } from "@/lib/journey";

export type ActivityKind =
  | "resumeUploaded"
  | "resumeAnalysed"
  | "rirekisho"
  | "shokumu"
  | "application"
  | "interview"
  | "visa";

export interface ActivityItem {
  key: string;
  kind: ActivityKind;
  /** ISO timestamp the item is sorted and labelled by. */
  at: string;
  href: Route;
  /** Shown beside the label: a file name or job title. */
  name?: string;
}

// Typed routes can't check a path built from a runtime id, so those hrefs are
// cast with `as Route`, as lib/routes.ts does.

/**
 * The latest things the user did, merged across the lists Home already has.
 * Only finished work counts: a failed document or abandoned interview isn't
 * something they did. A source that failed to load contributes nothing.
 */
export function recentActivity(input: JourneyInput, limit = 5): ActivityItem[] {
  const items: ActivityItem[] = [];
  const { resumes, primaryAnalysis, documents, applications, interviewSessions } = input;

  for (const r of resumes ?? []) {
    items.push({
      key: `resume-${r.id}`,
      kind: "resumeUploaded",
      at: r.created_at,
      href: `/dashboard/resumes/${r.id}` as Route,
      name: r.file_name,
    });
  }
  const primary = resumes ? pickPrimaryResume(resumes) : undefined;
  if (primary && primaryAnalysis) {
    items.push({
      key: `analysis-${primaryAnalysis.id}`,
      kind: "resumeAnalysed",
      at: primaryAnalysis.created_at,
      href: `/dashboard/resumes/${primary.id}` as Route,
    });
  }
  for (const d of documents ?? []) {
    if (d.status !== "completed") continue;
    items.push({
      key: `document-${d.id}`,
      kind: d.document_type === "rirekisho" ? "rirekisho" : "shokumu",
      at: d.completed_at ?? d.created_at,
      href: `/dashboard/documents/${d.id}` as Route,
    });
  }
  for (const a of applications ?? []) {
    items.push({
      key: `application-${a.id}`,
      kind: "application",
      at: a.created_at,
      href: "/dashboard/jobs/applications",
      ...(a.job_title ? { name: a.job_title } : {}),
    });
  }
  for (const s of interviewSessions ?? []) {
    if (s.status !== "completed") continue;
    items.push({
      key: `interview-${s.id}`,
      kind: "interview",
      at: s.completed_at ?? s.created_at,
      href: `/dashboard/interview/${s.id}` as Route,
    });
  }
  for (const v of input.visaConsultations ?? []) {
    items.push({
      key: `visa-${v.id}`,
      kind: "visa",
      at: v.created_at,
      href: `/dashboard/visa/${v.id}` as Route,
    });
  }

  return items.sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).slice(0, limit);
}

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 365 * 24 * 3600],
  ["month", 30 * 24 * 3600],
  ["week", 7 * 24 * 3600],
  ["day", 24 * 3600],
  ["hour", 3600],
  ["minute", 60],
];

/** "2 days ago" / "一昨日" / "2 hari yang lalu", in the largest whole unit. */
export function formatRelative(iso: string, lang: Language, now = Date.now()): string {
  const seconds = Math.round((Date.parse(iso) - now) / 1000);
  const rtf = new Intl.RelativeTimeFormat(lang, { numeric: "auto" });
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size) return rtf.format(Math.round(seconds / size), unit);
  }
  return rtf.format(0, "second");
}
