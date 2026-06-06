"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import type {
  JobMatch,
  JobPostingDetail,
  JobPostingList,
  MatchRequest,
  TranslateJobRequest,
} from "@/types/api";

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

interface ListJobsParams {
  q?: string;
  min_score?: number;
  offset?: number;
  limit?: number;
}

export function useJobs(params: ListJobsParams = {}) {
  const search = new URLSearchParams();
  if (params.q) search.set("q", params.q);
  if (params.min_score !== undefined) search.set("min_score", String(params.min_score));
  if (params.offset !== undefined) search.set("offset", String(params.offset));
  if (params.limit !== undefined) search.set("limit", String(params.limit));

  const qs = search.toString();
  return useQuery<JobPostingList>({
    queryKey: ["jobs", params],
    queryFn: () => apiClient.get<JobPostingList>(`/jobs${qs ? `?${qs}` : ""}`),
  });
}

// ---------------------------------------------------------------------------
// Detail
// ---------------------------------------------------------------------------

export function useJob(id: string) {
  return useQuery<JobPostingDetail>({
    queryKey: ["jobs", id],
    queryFn: () => apiClient.get<JobPostingDetail>(`/jobs/${id}`),
    enabled: Boolean(id),
  });
}

// ---------------------------------------------------------------------------
// Translate (create)
// ---------------------------------------------------------------------------

export function useTranslateJob() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: TranslateJobRequest) =>
      apiClient.post<JobPostingDetail>("/jobs/translate", body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
    },
  });
}

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

export function useDeleteJob() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (jobId: string) => apiClient.delete(`/jobs/${jobId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
    },
  });
}

// ---------------------------------------------------------------------------
// Match score
// ---------------------------------------------------------------------------

export function useMatchJob(jobId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: MatchRequest) =>
      apiClient.post<JobMatch>(`/jobs/${jobId}/match`, body),
    onSuccess: (data) => {
      queryClient.setQueryData(["jobs", jobId, "match", data.resume_id], data);
    },
  });
}

// Read a previously scored match result from the React Query cache.
// There is no GET endpoint — results are written by useMatchJob on success.
export function useCachedJobMatch(jobId: string, resumeId: string): JobMatch | undefined {
  const queryClient = useQueryClient();
  return queryClient.getQueryData<JobMatch>(["jobs", jobId, "match", resumeId]);
}
