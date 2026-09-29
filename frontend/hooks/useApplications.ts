"use client";

import { useMutation, useQuery, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { isForward } from "@/lib/pipeline";
import type {
  ApplicationStatus,
  CreateApplicationRequest,
  JobApplication,
  UpdateApplicationRequest,
} from "@/types/api";

const QK = ["jobs", "applications"] as const;

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export function useApplications(statusFilter?: ApplicationStatus) {
  const qs = statusFilter ? `?status=${statusFilter}` : "";
  return useQuery<JobApplication[]>({
    queryKey: [...QK, statusFilter ?? "all"],
    queryFn: () => apiClient.get<JobApplication[]>(`/jobs/applications${qs}`),
  });
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export function useCreateApplication() {
  const queryClient = useQueryClient();
  return useMutation<JobApplication, Error, CreateApplicationRequest>({
    mutationFn: (body) => apiClient.post<JobApplication>("/jobs/applications", body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: QK });
    },
  });
}

// ---------------------------------------------------------------------------
// Update (status / notes)
// ---------------------------------------------------------------------------

/**
 * The fields a PATCH will change, as the server will set them: closing or
 * skipping a job records the stage it left in closed_from, and reopening
 * clears it. Without it a closed job would say "Reopen at Saved" until the
 * refetch.
 */
function optimisticFields(app: JobApplication, data: UpdateApplicationRequest) {
  const to = data.status;
  if (to === undefined || to === app.status) return data;
  if (!isForward(to)) return { ...data, closed_from: isForward(app.status) ? app.status : null };
  return { ...data, closed_from: null };
}

/**
 * A move shows at once in every cached list; one the server refuses is put
 * back. The refetch afterwards brings in what the server set (applied_at,
 * closed_from).
 */
export function useUpdateApplication() {
  const queryClient = useQueryClient();
  return useMutation<
    JobApplication,
    Error,
    { id: string; data: UpdateApplicationRequest },
    { previous: [QueryKey, JobApplication[] | undefined][] }
  >({
    mutationFn: ({ id, data }) => apiClient.patch<JobApplication>(`/jobs/applications/${id}`, data),
    onMutate: async ({ id, data }) => {
      await queryClient.cancelQueries({ queryKey: QK });
      const previous = queryClient.getQueriesData<JobApplication[]>({ queryKey: QK });
      queryClient.setQueriesData<JobApplication[]>({ queryKey: QK }, (apps) =>
        apps?.map((app) => (app.id === id ? { ...app, ...optimisticFields(app, data) } : app)),
      );
      return { previous };
    },
    onError: (_error, _vars, context) => {
      for (const [key, apps] of context?.previous ?? []) queryClient.setQueryData(key, apps);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: QK });
    },
  });
}

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

export function useDeleteApplication() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (id) => apiClient.delete<void>(`/jobs/applications/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: QK });
    },
  });
}
