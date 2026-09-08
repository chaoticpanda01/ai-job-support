"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import type { VisaConsultation, VisaConsultationListItem, VisaRoadmap } from "@/types/api";

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

/** Assess the profile against every visa category. Costs one AI call. */
export function useAssessVisa() {
  const queryClient = useQueryClient();
  return useMutation<VisaConsultation, Error>({
    mutationFn: () => apiClient.post<VisaConsultation>("/visa/consultations", {}),
    onSuccess: (data) => {
      queryClient.setQueryData(["visa", "consultations", data.id], data);
      queryClient.setQueryData(["visa", "consultations", "latest"], data);
      void queryClient.invalidateQueries({ queryKey: ["visa", "consultations"] });
    },
  });
}

/**
 * Pick a visa. The server generates the roadmap or hands back the one it
 * already has, and makes it active either way — so this is both "build" and
 * "switch". Only the first pick of a given visa costs an AI call.
 */
export function useSelectRoadmap(consultationId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation<VisaRoadmap, Error, string>({
    mutationFn: (visaType: string) =>
      apiClient.post<VisaRoadmap>(`/visa/consultations/${consultationId}/roadmaps`, {
        visa_type: visaType,
      }),
    onSuccess: (roadmap) => {
      queryClient.setQueryData<VisaConsultation | undefined>(
        ["visa", "consultations", "latest"],
        (prev) => {
          if (!prev) return prev;
          const others = prev.roadmaps.filter((r) => r.id !== roadmap.id);
          return { ...prev, roadmaps: [...others, roadmap], active_roadmap_id: roadmap.id };
        },
      );
    },
  });
}

/**
 * Save checklist progress. Sends the full set of completed step IDs, and
 * updates the cache optimistically so the checkbox never waits on the network.
 */
export function useUpdateProgress() {
  const queryClient = useQueryClient();
  return useMutation<VisaRoadmap, Error, { roadmapId: string; completedSteps: string[] }>({
    mutationFn: ({ roadmapId, completedSteps }) =>
      apiClient.patch<VisaRoadmap>(`/visa/roadmaps/${roadmapId}/progress`, {
        completed_steps: completedSteps,
      }),
    onSuccess: (roadmap) => {
      queryClient.setQueryData<VisaConsultation | undefined>(
        ["visa", "consultations", "latest"],
        (prev) =>
          prev
            ? {
                ...prev,
                roadmaps: prev.roadmaps.map((r) => (r.id === roadmap.id ? roadmap : r)),
              }
            : prev,
      );
    },
  });
}
