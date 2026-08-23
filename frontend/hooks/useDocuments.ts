"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import type {
  CreateDocumentRequest,
  Document,
  DocumentDetail,
  DocumentList,
  DocumentStatusResponse,
  DocumentType,
} from "@/types/api";

const POLL_INTERVAL_MS = 3_000;
const POLL_MAX_ATTEMPTS = 60; // 3 min ceiling

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

export function useDocuments(type?: DocumentType) {
  const params = type ? `?type=${type}` : "";
  return useQuery<DocumentList>({
    queryKey: ["documents", type ?? "all"],
    queryFn: () => apiClient.get<DocumentList>(`/documents${params}`),
  });
}

// ---------------------------------------------------------------------------
// Status poll — refetches every 3 s until completed or failed
// ---------------------------------------------------------------------------

export function useDocumentStatus(id: string) {
  return useQuery<DocumentStatusResponse>({
    queryKey: ["documents", id, "status"],
    queryFn: () => apiClient.get<DocumentStatusResponse>(`/documents/${id}`),
    enabled: Boolean(id),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (status === "completed" || status === "failed") return false;
      return POLL_INTERVAL_MS;
    },
    retry: (failureCount) => failureCount < POLL_MAX_ATTEMPTS,
    retryDelay: POLL_INTERVAL_MS,
  });
}

// ---------------------------------------------------------------------------
// Detail (with presigned download URL) — fetched on demand
// ---------------------------------------------------------------------------

export function useDocumentDetail(id: string, enabled = true) {
  return useQuery<DocumentDetail>({
    queryKey: ["documents", id, "detail"],
    queryFn: () => apiClient.get<DocumentDetail>(`/documents/${id}/download`),
    enabled: Boolean(id) && enabled,
    // Presigned URLs expire in 15 min — refetch after 14 min
    staleTime: 14 * 60 * 1_000,
  });
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export function useCreateDocument(type: DocumentType) {
  const queryClient = useQueryClient();
  const endpoint = type === "rirekisho" ? "/documents/rirekisho" : "/documents/shokumu";

  return useMutation({
    mutationFn: (body: CreateDocumentRequest) =>
      apiClient.post<DocumentStatusResponse>(endpoint, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["documents"] });
    },
  });
}

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

export function useDeleteDocument() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (documentId: string) => apiClient.delete(`/documents/${documentId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["documents"] });
    },
  });
}
