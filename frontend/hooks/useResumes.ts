"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient, ApiClientError } from "@/lib/api-client";
import type { AnalyzeResponse, ResumeAnalysis, ResumeDetail, ResumeList } from "@/types/api";

export function useResumes() {
  return useQuery<ResumeList>({
    queryKey: ["resumes"],
    queryFn: () => apiClient.get<ResumeList>("/resumes"),
  });
}

export function useResume(id: string) {
  return useQuery<ResumeDetail>({
    queryKey: ["resumes", id],
    queryFn: () => apiClient.get<ResumeDetail>(`/resumes/${id}`),
    enabled: Boolean(id),
  });
}

const ANALYSIS_POLL_INTERVAL_MS = 3000;
/** How long the detail page polls for a queued analysis before giving up. */
export const ANALYSIS_POLL_TIMEOUT_MS = 60_000;

/** When the analysis endpoint last answered, with data or with an error. */
function lastCheckedAt(state: { dataUpdatedAt: number; errorUpdatedAt: number }) {
  return Math.max(state.dataUpdatedAt, state.errorUpdatedAt);
}

/**
 * Latest analysis for a resume, or null while none exists (the API's 404).
 *
 * Pass `pollUntil` (a timestamp) after queueing an analysis to poll until the
 * result lands or that time passes. The backend has no job status to poll: it
 * only writes a row on success, so a failed background job stays a 404 and
 * `timedOut` is the only signal the client gets.
 */
export function useResumeAnalysis(resumeId: string, pollUntil: number | null = null) {
  const query = useQuery<ResumeAnalysis | null>({
    queryKey: ["resumes", resumeId, "analysis"],
    queryFn: async () => {
      try {
        return await apiClient.get<ResumeAnalysis>(`/resumes/${resumeId}/analysis`);
      } catch (err) {
        if (err instanceof ApiClientError && err.status === 404) return null;
        throw err;
      }
    },
    enabled: Boolean(resumeId),
    refetchInterval: (q) =>
      pollUntil !== null && !q.state.data && lastCheckedAt(q.state) < pollUntil
        ? ANALYSIS_POLL_INTERVAL_MS
        : false,
  });

  // Same lastCheckedAt comparison as refetchInterval, so the timeout shows
  // exactly when polling stops. Comparing Date.now() here could disagree.
  const timedOut = pollUntil !== null && !query.data && lastCheckedAt(query) >= pollUntil;

  return {
    data: query.data,
    isLoading: query.isLoading,
    error: query.error,
    timedOut,
  };
}

export function useAnalyzeResume() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ resumeId, language }: { resumeId: string; language: string }) =>
      apiClient.post<AnalyzeResponse>(`/resumes/${resumeId}/analyze`, {
        analysis_type: "general",
        language,
      }),
    onSuccess: (_data, { resumeId }) => {
      // Fetch now. The detail page's pollUntil keeps it polling until the
      // result lands or the deadline passes.
      queryClient.invalidateQueries({ queryKey: ["resumes", resumeId, "analysis"] });
    },
  });
}

export function useSetPrimaryResume() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (resumeId: string) => apiClient.put(`/resumes/${resumeId}/primary`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["resumes"] });
    },
  });
}

export function useDeleteResume() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (resumeId: string) => apiClient.delete(`/resumes/${resumeId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["resumes"] });
    },
  });
}
