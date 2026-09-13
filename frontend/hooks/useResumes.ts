"use client";

import { useEffect, useRef } from "react";
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
 * outcome on the resume, so a failure comes back as "failed" with an error code,
 * after a reload too. When a pending request ends, the analysis is fetched again.
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
    refetchInterval: (q) =>
      q.state.data?.status === "pending" ? ANALYSIS_POLL_INTERVAL_MS : false,
  });

  const current = status.data?.status;
  const wasPending = useRef(false);
  useEffect(() => {
    if (current === "pending") {
      wasPending.current = true;
    } else if (current !== undefined && wasPending.current) {
      wasPending.current = false;
      void queryClient.invalidateQueries({ queryKey: analysisKey(resumeId) });
    }
  }, [current, queryClient, resumeId]);

  return {
    data: analysis.data,
    isLoading: analysis.isLoading,
    error: analysis.error,
    status: status.data,
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
      // The request is pending on the server now. Saying so here starts polling
      // straight away rather than after the next status fetch.
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
