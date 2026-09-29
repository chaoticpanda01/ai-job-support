"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { isForward } from "@/lib/pipeline";
import type {
  ApplicationStatus,
  CreateApplicationRequest,
  JobApplication,
  UpdateApplicationRequest,
} from "@/types/api";

const QK = ["jobs", "applications"] as const;
const UPDATE_KEY = [...QK, "update"] as const;
/** The cached list of every application, which is the only one the pages read. */
const listKey = (statusFilter?: ApplicationStatus) => [...QK, statusFilter ?? "all"] as const;

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export function useApplications(statusFilter?: ApplicationStatus) {
  const qs = statusFilter ? `?status=${statusFilter}` : "";
  return useQuery<JobApplication[]>({
    queryKey: listKey(statusFilter),
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
    onSuccess: (created) => {
      // In the list before the refetch lands, so the row goes straight from Save
      // to its stage instead of showing Save again in between.
      queryClient.setQueryData<JobApplication[]>(listKey(), (apps) =>
        apps && !apps.some((app) => app.id === created.id) ? [created, ...apps] : apps,
      );
      void queryClient.invalidateQueries({ queryKey: QK });
    },
  });
}

// ---------------------------------------------------------------------------
// Update (status / notes)
// ---------------------------------------------------------------------------

/**
 * The fields a PATCH will change, as the server will set them: closing or
 * skipping a job records the stage it left in closed_from, reopening clears
 * it, and stepping back from Applied to Preparing forgets the applied date.
 * Without them a closed job would say "Reopen at Saved" until the refetch.
 */
function optimisticFields(app: JobApplication, data: UpdateApplicationRequest) {
  const to = data.status;
  if (to === undefined || to === app.status) return data;
  const closed_from = isForward(to) ? null : isForward(app.status) ? app.status : null;
  if (app.status === "applied" && to === "preparing") {
    return { ...data, closed_from, applied_at: null };
  }
  return { ...data, closed_from };
}

/**
 * A move shows at once in every cached list; one the server refuses puts back
 * only that job, and only the fields it changed, so a change made since isn't
 * undone with it. The refetch brings
 * in what the server set (applied_at, closed_from), and waits for the last of
 * several quick moves, since until then the server's view of the others is old.
 */
export function useUpdateApplication() {
  const queryClient = useQueryClient();
  return useMutation<
    JobApplication,
    Error,
    { id: string; data: UpdateApplicationRequest },
    { previous: JobApplication | undefined }
  >({
    mutationKey: UPDATE_KEY,
    mutationFn: ({ id, data }) => apiClient.patch<JobApplication>(`/jobs/applications/${id}`, data),
    onMutate: async ({ id, data }) => {
      await queryClient.cancelQueries({ queryKey: QK });
      let previous: JobApplication | undefined;
      for (const [, apps] of queryClient.getQueriesData<JobApplication[]>({ queryKey: QK })) {
        previous ??= apps?.find((app) => app.id === id);
      }
      queryClient.setQueriesData<JobApplication[]>({ queryKey: QK }, (apps) =>
        apps?.map((app) => (app.id === id ? { ...app, ...optimisticFields(app, data) } : app)),
      );
      return { previous };
    },
    onError: (_error, { id, data }, context) => {
      const previous = context?.previous;
      if (!previous) return;
      // Only what this update changed goes back. The same job may have been changed
      // again since (a note saved, a move made), and that stays.
      const undo = Object.fromEntries(
        Object.keys(optimisticFields(previous, data)).map((key) => [
          key,
          previous[key as keyof JobApplication],
        ]),
      ) as Partial<JobApplication>;
      queryClient.setQueriesData<JobApplication[]>({ queryKey: QK }, (apps) =>
        apps?.map((app) => (app.id === id ? { ...app, ...undo } : app)),
      );
    },
    onSettled: () => {
      // This one still counts as in flight while its own onSettled runs.
      if (queryClient.isMutating({ mutationKey: UPDATE_KEY }) <= 1) {
        void queryClient.invalidateQueries({ queryKey: QK });
      }
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
