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

/** The backend's largest page (Pagination.MAX_LIMIT in backend/app/dependencies.py). */
const PAGE_LIMIT = 100;

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

/**
 * Loading for the first time, as opposed to retrying after a failure. React
 * Query puts a query with no data back to pending, error cleared, on every
 * refetch; a failed source is refetched on each new mount and window focus,
 * so treating that as loading would blank Home back to skeletons each time.
 * errorUpdateCount is the one field that remembers the failure.
 */
function isFirstLoad(query: { isLoading: boolean; errorUpdateCount: number }): boolean {
  return query.isLoading && query.errorUpdateCount === 0;
}

export interface UseJourneyResult {
  journey: Journey;
  /** The raw lists, for Home's recent activity. */
  input: JourneyInput;
  isLoading: boolean;
  retry: (step: StepId) => void;
  /** Whether the data behind a step is being fetched again, e.g. after retry(). */
  retrying: (step: StepId) => boolean;
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
  // The largest page the backend allows. The default 20 is newest first, so a
  // user with 20 newer documents (failed attempts too) would lose a finished
  // 履歴書 off the end and be told to make it again.
  const documents = useDocuments(undefined, PAGE_LIMIT);
  const applications = useApplications();
  // GET /interview/sessions returns completed sessions only (list_completed in
  // backend/app/api/v1/interview.py), so its first page answers "has the user
  // completed one?" at any size. The largest page is belt and braces: if the
  // endpoint ever returned abandoned sessions too, newer ones could push the
  // only completed session off a 20-item page, as documents once did.
  const interviews = useInterviewSessions(PAGE_LIMIT);
  const visa = useVisaConsultations();

  // undefined means "couldn't load", which journey.ts shows as unknown. The
  // analysis hook turns a 404 into null, meaning "no analysis yet". A failed
  // query that is being retried has had its error cleared (see isFirstLoad),
  // so a past failure counts too; otherwise a retry would read as "not
  // analysed" and be suggested as the next step.
  const analysisFailed = Boolean(analysis.error) || analysis.errorUpdateCount > 0;
  const input: JourneyInput = {
    me: me.data,
    resumes: resumes.data?.items,
    primaryAnalysis:
      analysis.data !== undefined ? analysis.data : analysisFailed ? undefined : null,
    documents: documents.data?.items,
    applications: applications.data,
    interviewSessions: interviews.data,
    visaConsultations: visa.data,
  };

  const isLoading = [me, resumes, analysis, documents, applications, interviews, visa].some(
    isFirstLoad,
  );

  const queriesBehind: Record<StepId, { isFetching: boolean }[]> = {
    profile: [me],
    resumeUploaded: [resumes],
    resumeAnalysed: [resumes, analysis],
    rirekisho: [documents],
    shokumu: [documents],
    application: [applications],
    interview: [interviews],
    visa: [visa],
  };

  return {
    journey: computeJourney(input),
    input,
    isLoading,
    retry: (step) => void queryClient.invalidateQueries({ queryKey: [...STEP_QUERY_KEYS[step]] }),
    retrying: (step) => queriesBehind[step].some((query) => query.isFetching),
  };
}
