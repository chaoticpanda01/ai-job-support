"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient, isMissingResourceError } from "@/lib/api-client";
import type {
  CreateDocumentRequest,
  DocumentDetail,
  DocumentList,
  DocumentStatusResponse,
  DocumentType,
} from "@/types/api";

const POLL_INTERVAL_MS = 3_000;
// Retries per poll, before the failure is shown. Low on purpose: the page keeps
// polling on its own, so these only decide how long a blip stays invisible.
const POLL_RETRY_ATTEMPTS = 2;

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

/**
 * Poll one document until it finishes. The generation runs in the background,
 * so the document's own status is the only report of how it went.
 *
 * Separates the two ways this can fail, because the page shows them
 * differently: `loadError` is a document that never loaded (nothing to show),
 * `pollError` is a poll that failed after one succeeded (keep showing the
 * document, warn that it may be out of date).
 */
export function useDocumentStatus(id: string) {
  const query = useQuery<DocumentStatusResponse>({
    queryKey: ["documents", id, "status"],
    queryFn: () => apiClient.get<DocumentStatusResponse>(`/documents/${id}`),
    enabled: Boolean(id),
    refetchInterval: (query) => {
      // The query has given up -- whether or not a document loaded first.
      // Polling on would repeat a failing request behind an error the page
      // already shows, and the page's Try again is what resumes it.
      if (query.state.status === "error") return false;
      const status = query.state.data?.status;
      if (status === "completed" || status === "failed") return false;
      return POLL_INTERVAL_MS;
    },
    // A document that isn't there won't appear on a retry.
    retry: (failureCount, error) =>
      !isMissingResourceError(error) && failureCount < POLL_RETRY_ATTEMPTS,
    retryDelay: POLL_INTERVAL_MS,
  });

  const loaded = query.data !== undefined;
  return {
    data: query.data,
    isLoading: query.isLoading,
    loadError: loaded ? null : query.error,
    pollError: loaded ? query.error : null,
    /** Changes on every new failure, so the page can re-announce it. */
    errorCount: query.errorUpdateCount,
    isChecking: query.isFetching,
    recheck: () => void query.refetch(),
  };
}

// ---------------------------------------------------------------------------
// Detail (with presigned download URL) — fetched on demand
// ---------------------------------------------------------------------------

/**
 * Fetch a completed document's presigned download link.
 *
 * The link is the whole point of a finished generation, and this request can
 * fail on its own (the API returns 502 when it can't sign the URL), so the
 * error is returned for the page to show. Without it a failure here is
 * indistinguishable from a link still being prepared.
 */
export function useDocumentDetail(id: string, enabled = true) {
  const query = useQuery<DocumentDetail>({
    queryKey: ["documents", id, "detail"],
    queryFn: () => apiClient.get<DocumentDetail>(`/documents/${id}/download`),
    enabled: Boolean(id) && enabled,
    // Presigned URLs expire in 15 min — refetch after 14 min
    staleTime: 14 * 60 * 1_000,
    retry: (failureCount, error) =>
      !isMissingResourceError(error) && failureCount < POLL_RETRY_ATTEMPTS,
  });

  return {
    data: query.data,
    error: query.error,
    /** Changes on every new failure, so the page can re-announce it. */
    errorCount: query.errorUpdateCount,
    isFetching: query.isFetching,
    refetch: query.refetch,
  };
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
