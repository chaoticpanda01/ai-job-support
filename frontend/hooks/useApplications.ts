"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
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

export function useUpdateApplication() {
  const queryClient = useQueryClient();
  return useMutation<JobApplication, Error, { id: string; data: UpdateApplicationRequest }>({
    mutationFn: ({ id, data }) => apiClient.patch<JobApplication>(`/jobs/applications/${id}`, data),
    onSuccess: () => {
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
