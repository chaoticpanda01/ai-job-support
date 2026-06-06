"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import type { VisaConsultation, VisaConsultationListItem } from "@/types/api";

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export function useVisaConsultations() {
  return useQuery<VisaConsultationListItem[]>({
    queryKey: ["visa", "consultations"],
    queryFn: () => apiClient.get<VisaConsultationListItem[]>("/visa/consultations"),
  });
}

export function useLatestVisaConsultation() {
  return useQuery<VisaConsultation>({
    queryKey: ["visa", "consultations", "latest"],
    queryFn: () => apiClient.get<VisaConsultation>("/visa/consultations/latest"),
    retry: (failureCount, error) => {
      // Don't retry a 404 — the user simply has no consultation yet
      if ((error as { status?: number }).status === 404) return false;
      return failureCount < 2;
    },
  });
}

export function useVisaConsultation(id: string) {
  return useQuery<VisaConsultation>({
    queryKey: ["visa", "consultations", id],
    queryFn: () => apiClient.get<VisaConsultation>(`/visa/consultations/${id}`),
    enabled: Boolean(id),
  });
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export function useGenerateVisa() {
  const queryClient = useQueryClient();
  return useMutation<VisaConsultation, Error>({
    mutationFn: () => apiClient.post<VisaConsultation>("/visa/consultations", {}),
    onSuccess: (data) => {
      // Update the detail cache for this consultation
      queryClient.setQueryData(["visa", "consultations", data.id], data);
      // Replace the "latest" cache entry
      queryClient.setQueryData(["visa", "consultations", "latest"], data);
      // Invalidate the list so it includes the new item
      void queryClient.invalidateQueries({ queryKey: ["visa", "consultations"] });
    },
  });
}
