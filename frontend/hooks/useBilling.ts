"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import type {
  BillingEvent,
  CheckoutRequest,
  CheckoutResponse,
  PortalResponse,
  Subscription,
} from "@/types/api";

// ---------------------------------------------------------------------------
// Subscription query
// ---------------------------------------------------------------------------

export function useSubscription() {
  return useQuery<Subscription | null>({
    queryKey: ["billing", "subscription"],
    queryFn: async () => {
      try {
        return await apiClient.get<Subscription>("/billing/subscription");
      } catch (err) {
        // 404 means free tier — normalise to null instead of throwing
        if ((err as { status?: number }).status === 404) return null;
        throw err;
      }
    },
    staleTime: 60_000, // subscription state rarely changes mid-session
  });
}

// ---------------------------------------------------------------------------
// Billing event history
// ---------------------------------------------------------------------------

export function useBillingEvents() {
  return useQuery<BillingEvent[]>({
    queryKey: ["billing", "events"],
    queryFn: () => apiClient.get<BillingEvent[]>("/billing/events"),
  });
}

// ---------------------------------------------------------------------------
// Checkout — redirect to Stripe hosted checkout
// ---------------------------------------------------------------------------

export function useCreateCheckout() {
  return useMutation<CheckoutResponse, Error, CheckoutRequest>({
    mutationFn: (body) => apiClient.post<CheckoutResponse>("/billing/checkout", body),
    onSuccess: ({ url }) => {
      // Hard-navigate to Stripe Checkout — cannot use Next.js router here
      window.location.href = url;
    },
  });
}

// ---------------------------------------------------------------------------
// Customer portal — redirect to Stripe self-service portal
// ---------------------------------------------------------------------------

export function useCustomerPortal() {
  return useMutation<PortalResponse, Error>({
    mutationFn: () => apiClient.post<PortalResponse>("/billing/portal", {}),
    onSuccess: ({ url }) => {
      window.location.href = url;
    },
  });
}

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
