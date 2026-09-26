"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useApplications } from "@/hooks/useApplications";
import { useDocuments } from "@/hooks/useDocuments";
import { useInterviewSessions } from "@/hooks/useInterview";
import { useMe } from "@/hooks/useMe";
import { useResumeAnalysis, useResumes } from "@/hooks/useResumes";
import { useVisaConsultations } from "@/hooks/useVisa";
import {
  computeJourney,
  pickPrimaryResume,
  type Journey,
  type JourneyInput,
  type StepId,
} from "@/lib/journey";

/**
 * The queries behind each step, refreshed by retry(). These are prefixes:
 * ["resumes"] also covers the primary resume's analysis, which lives under
 * ["resumes", id, "analysis"].
 */
const STEP_QUERY_KEYS: Record<StepId, readonly string[]> = {
  profile: ["me"],
  resumeUploaded: ["resumes"],
  resumeAnalysed: ["resumes"],
  rirekisho: ["documents"],
  shokumu: ["documents"],
  application: ["jobs", "applications"],
  interview: ["interview", "sessions"],
  visa: ["visa", "consultations"],
};

export interface UseJourneyResult {
  journey: Journey;
  /** The raw lists, for Home's recent activity. */
  input: JourneyInput;
  isLoading: boolean;
  retry: (step: StepId) => void;
}

/**
 * The user's journey from the app's existing queries. No endpoint of its own:
 * React Query shares these with the pages that own them, so the sidebar and
 * Home cost one set of requests between them.
 */
export function useJourney(): UseJourneyResult {
  const queryClient = useQueryClient();
  const me = useMe();
  const resumes = useResumes();
  const primary = resumes.data ? pickPrimaryResume(resumes.data.items) : undefined;
  // "" disables the query until there is a resume to ask about.
  const analysis = useResumeAnalysis(primary?.id ?? "");
  const documents = useDocuments();
  const applications = useApplications();
  const interviews = useInterviewSessions();
  const visa = useVisaConsultations();

  // undefined means "couldn't load", which journey.ts shows as unknown. The
  // analysis hook turns a 404 into null, meaning "no analysis yet".
  const input: JourneyInput = {
    me: me.data,
    resumes: resumes.data?.items,
    primaryAnalysis:
      analysis.data !== undefined ? analysis.data : analysis.error ? undefined : null,
    documents: documents.data?.items,
    applications: applications.data,
    interviewSessions: interviews.data,
    visaConsultations: visa.data,
  };

  const isLoading =
    me.isLoading ||
    resumes.isLoading ||
    analysis.isLoading ||
    documents.isLoading ||
    applications.isLoading ||
    interviews.isLoading ||
    visa.isLoading;

  return {
    journey: computeJourney(input),
    input,
    isLoading,
    retry: (step) => void queryClient.invalidateQueries({ queryKey: [...STEP_QUERY_KEYS[step]] }),
  };
}
