"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient, ApiClientError } from "@/lib/api-client";
import type {
  AnalyzeResponse,
  ResumeAnalysis,
  ResumeAnalysisStatus,
  ResumeDetail,
  ResumeList,
} from "@/types/api";

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

const analysisKey = (resumeId: string) => ["resumes", resumeId, "analysis"];
const analysisStatusKey = (resumeId: string) => ["resumes", resumeId, "analysis-status"];

/**
 * The latest analysis for a resume (null while none exists, the API's 404), and
 * the status of the latest analysis request.
 *
 * The status is polled while a request is pending. The backend records every
 * outcome of the current request on the resume, so a failure comes back as
 * "failed" with an error code, after a reload too. When a pending request ends,
 * the analysis is fetched again, and `finishing` stays true until it arrives.
 */
export function useResumeAnalysis(resumeId: string) {
  const queryClient = useQueryClient();

  const analysis = useQuery<ResumeAnalysis | null>({
    queryKey: analysisKey(resumeId),
    queryFn: async () => {
      try {
        return await apiClient.get<ResumeAnalysis>(`/resumes/${resumeId}/analysis`);
      } catch (err) {
        if (err instanceof ApiClientError && err.status === 404) return null;
        throw err;
      }
    },
    enabled: Boolean(resumeId),
  });

  const status = useQuery<ResumeAnalysisStatus>({
    queryKey: analysisStatusKey(resumeId),
    queryFn: () => apiClient.get<ResumeAnalysisStatus>(`/resumes/${resumeId}/analysis/status`),
    enabled: Boolean(resumeId),
    // Poll while pending, but not after a failed check: the page shows that error
    // with a retry rather than polling a failing endpoint every few seconds.
    refetchInterval: (q) =>
      q.state.status !== "error" && q.state.data?.status === "pending"
        ? ANALYSIS_POLL_INTERVAL_MS
        : false,
  });

  // Notice a pending request ending during render, not in an effect, so
  // `finishing` is already true on that render and the page's empty state
  // doesn't flash up before the result arrives.
  const current = status.data?.status;
  const [previous, setPrevious] = useState(current);
  const [finishing, setFinishing] = useState(false);
  if (current !== previous) {
    setPrevious(current);
    if (previous === "pending" && current !== undefined) setFinishing(true);
  }

  useEffect(() => {
    if (!finishing) return;
    void queryClient
      .invalidateQueries({ queryKey: analysisKey(resumeId) })
      .finally(() => setFinishing(false));
  }, [finishing, queryClient, resumeId]);

  return {
    data: analysis.data,
    isLoading: analysis.isLoading,
    error: analysis.error,
    status: status.data,
    statusError: status.error,
    /** Changes each time a status check fails, so its message can be re-announced. */
    statusErrorCount: status.errorUpdateCount,
    checkingStatus: status.isFetching,
    refetchStatus: () => void status.refetch(),
    finishing,
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
    onSuccess: async (_data, { resumeId }) => {
      // Polling only runs while the cached status is pending, and until now it
      // isn't, so set it here. Cancel any status fetch in flight first: it may
      // have read the row before this request and would overwrite pending.
      await queryClient.cancelQueries({ queryKey: analysisStatusKey(resumeId) });
      queryClient.setQueryData<ResumeAnalysisStatus>(analysisStatusKey(resumeId), {
        status: "pending",
        error_code: null,
      });
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
