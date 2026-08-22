"use client";

import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import type { AIQuota } from "@/types/api";

/**
 * The caller's binding AI call quota.
 *
 * Freshness is interval-based rather than invalidation-based on purpose. Two
 * of the nine check_budget call sites spend quota inside background workers
 * (resume analysis, document generation), so no mutation ever resolves at the
 * moment those spends land — per-call-site invalidation is structurally blind
 * to them. A while-visible interval catches every spend and cannot be
 * forgotten by a future AI feature.
 *
 * staleTime overrides the 30s default in lib/providers.tsx so that the
 * refetch-on-window-focus this relies on actually fires.
 * refetchIntervalInBackground defaults to false, so a hidden tab polls nothing.
 */
export function useAiQuota() {
  return useQuery<AIQuota>({
    queryKey: ["aiQuota"],
    queryFn: () => apiClient.get<AIQuota>("/auth/me/ai-quota"),
    staleTime: 0,
    refetchInterval: 60_000,
  });
}
