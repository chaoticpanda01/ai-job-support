import type { DocumentStatus, InterviewStatus, VisaEligibility } from "@/types/api";

/**
 * The five meanings colour carries in the app. Badge's variants use the same
 * names, and every pair below is covered by the contrast tests in
 * tests/lib/design-tokens.test.ts. Pages say what a thing means (a tone), not
 * which colour it is.
 */
export type Tone = "neutral" | "info" | "success" | "warning" | "danger";

/** Text in a tone: score numbers, short labels. */
export const toneText: Record<Tone, string> = {
  neutral: "text-muted-foreground",
  info: "text-indigo",
  success: "text-success",
  warning: "text-warning",
  danger: "text-destructive",
};

/** A tinted background, for boxes; pair it with toneText. */
export const toneSoft: Record<Tone, string> = {
  neutral: "bg-secondary",
  info: "bg-indigo-soft",
  success: "bg-success-soft",
  warning: "bg-warning-soft",
  danger: "bg-destructive-soft",
};

/** A solid fill, for bars and dots. */
export const toneFill: Record<Tone, string> = {
  neutral: "bg-muted-foreground",
  info: "bg-indigo",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-destructive",
};

/** Where a score turns from fair to good, and from poor to fair. */
export interface ScoreBands {
  good: number;
  fair: number;
}

/** The resume analysis' japan_market_score. */
export const RESUME_SCORE_BANDS: ScoreBands = { good: 81, fair: 61 };

/** Interview answer scores, progress bars and the session's overall score. */
export const INTERVIEW_SCORE_BANDS: ScoreBands = { good: 70, fair: 50 };

export function scoreTone(score: number, bands: ScoreBands): Tone {
  if (score >= bands.good) return "success";
  if (score >= bands.fair) return "warning";
  return "danger";
}

export const DOCUMENT_STATUS_TONE: Record<DocumentStatus, Tone> = {
  pending: "warning",
  processing: "info",
  completed: "success",
  failed: "danger",
};

export const SESSION_STATUS_TONE: Record<InterviewStatus, Tone> = {
  active: "success",
  completed: "info",
  abandoned: "neutral",
};

export const ELIGIBILITY_TONE: Record<VisaEligibility, Tone> = {
  eligible: "success",
  eligible_with_gaps: "warning",
  not_eligible: "neutral",
};
