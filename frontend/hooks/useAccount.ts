"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";

// ---------------------------------------------------------------------------
// Account deletion
// ---------------------------------------------------------------------------

export function useDeleteAccount() {
  const queryClient = useQueryClient();
  return useMutation<void, Error>({
    mutationFn: () => apiClient.delete<void>("/account"),
    onSuccess: () => {
      // Clear all cached data — the user no longer exists
      queryClient.clear();
    },
  });
}
