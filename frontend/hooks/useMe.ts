"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import type { MeResponse, ProfileUpdateRequest } from "@/types/api";

export function useMe() {
  return useQuery<MeResponse>({
    queryKey: ["me"],
    queryFn: () => apiClient.get<MeResponse>("/auth/me"),
  });
}

export function useUpdateProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: ProfileUpdateRequest) => apiClient.put<MeResponse>("/auth/me", data),
    onSuccess: (updated) => {
      queryClient.setQueryData(["me"], updated);
    },
  });
}

export function useRecordConsent() {
  const queryClient = useQueryClient();
  return useMutation<MeResponse, Error>({
    mutationFn: () => apiClient.post<MeResponse>("/auth/consent", {}),
    onSuccess: (updated) => {
      queryClient.setQueryData(["me"], updated);
    },
  });
}
