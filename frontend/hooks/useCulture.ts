"use client";

import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import type { CultureTopicDetail, CultureTopicSummary, GlossaryEntry } from "@/types/api";

// Topics are public content that changes infrequently — cache for 10 minutes.
const STALE_TIME_MS = 10 * 60 * 1000;

// ---------------------------------------------------------------------------
// Topics
// ---------------------------------------------------------------------------

interface ListTopicsParams {
  tag?: string | undefined;
  offset?: number | undefined;
  limit?: number | undefined;
}

export function useCultureTopics(params: ListTopicsParams = {}) {
  const search = new URLSearchParams();
  if (params.tag) search.set("tag", params.tag);
  if (params.offset !== undefined) search.set("offset", String(params.offset));
  if (params.limit !== undefined) search.set("limit", String(params.limit));
  const qs = search.toString();

  return useQuery<CultureTopicSummary[]>({
    queryKey: ["culture", "topics", params],
    queryFn: () =>
      apiClient.get<CultureTopicSummary[]>(`/culture/topics${qs ? `?${qs}` : ""}`),
    staleTime: STALE_TIME_MS,
  });
}

export function useCultureTopic(slug: string) {
  return useQuery<CultureTopicDetail>({
    queryKey: ["culture", "topics", slug],
    queryFn: () => apiClient.get<CultureTopicDetail>(`/culture/topics/${slug}`),
    enabled: Boolean(slug),
    staleTime: STALE_TIME_MS,
  });
}

// ---------------------------------------------------------------------------
// Glossary
// ---------------------------------------------------------------------------

export function useGlossary() {
  return useQuery<GlossaryEntry[]>({
    queryKey: ["culture", "glossary"],
    queryFn: () => apiClient.get<GlossaryEntry[]>("/culture/glossary"),
    staleTime: STALE_TIME_MS,
  });
}
