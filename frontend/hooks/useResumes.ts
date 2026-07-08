"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
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

export function useResumeAnalysis(resumeId: string) {
  return useQuery<ResumeAnalysis>({
    queryKey: ["resumes", resumeId, "analysis"],
    queryFn: () => apiClient.get<ResumeAnalysis>(`/resumes/${resumeId}/analysis`),
    enabled: Boolean(resumeId),
    // Re-poll every 3 s until analysis lands (status field does not exist on
    // ResumeAnalysis — we just retry until 200 OK or a non-404 error)
    retry: (failureCount, error) => {
      if (error instanceof Error && error.message.includes("404")) {
        return failureCount < 20; // poll up to ~60 s
      }
      return failureCount < 1;
    },
    retryDelay: 3000,
  });
}

export function useAnalyzeResume() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ resumeId }: { resumeId: string }) =>
      apiClient.post<AnalyzeResponse>(`/resumes/${resumeId}/analyze`, {
        analysis_type: "general",
      }),
    onSuccess: (_data, { resumeId }) => {
      // Invalidate so the analysis query starts polling
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
