"use client";

import { useCallback, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchEventSource, type FetchEventSourceInit } from "@microsoft/fetch-event-source";
import { apiClient } from "@/lib/api-client";
import type {
  CreateSessionRequest,
  InterviewEvaluation,
  InterviewSession,
  InterviewSessionDetail,
  InterviewSummary,
  SseEvent,
} from "@/types/api";

const API_PREFIX = "/api/v1";

// ---------------------------------------------------------------------------
// Session queries
// ---------------------------------------------------------------------------

export function useInterviewSession(id: string) {
  return useQuery<InterviewSessionDetail>({
    queryKey: ["interview", "sessions", id],
    queryFn: () => apiClient.get<InterviewSessionDetail>(`/interview/sessions/${id}`),
    enabled: Boolean(id),
  });
}

export function useInterviewSessions() {
  return useQuery<InterviewSession[]>({
    queryKey: ["interview", "sessions"],
    queryFn: () => apiClient.get<InterviewSession[]>("/interview/sessions"),
  });
}

// ---------------------------------------------------------------------------
// SSE stream state
// ---------------------------------------------------------------------------

export interface StreamState {
  /** Tokens accumulated from the current streamed message */
  streamingText: string;
  /** Whether a stream is in flight */
  isStreaming: boolean;
  /** Last received evaluation (for the user's previous answer) */
  lastEval: InterviewEvaluation | null;
  /** Session summary (populated after end session) */
  summary: InterviewSummary | null;
  /** Error message if the stream errored */
  error: string | null;
}

const INITIAL_STATE: StreamState = {
  streamingText: "",
  isStreaming: false,
  lastEval: null,
  summary: null,
  error: null,
};

// ---------------------------------------------------------------------------
// Main interview hook
// ---------------------------------------------------------------------------

export function useInterview() {
  const queryClient = useQueryClient();
  const abortRef = useRef<AbortController | null>(null);

  const [state, setState] = useState<StreamState>(INITIAL_STATE);
  const [sessionId, setSessionId] = useState<string | null>(null);

  // Accumulate streamed tokens outside React state for performance
  const textBuffer = useRef("");

  function _resetStream() {
    textBuffer.current = "";
    setState((s) => ({ ...s, streamingText: "", isStreaming: true, error: null }));
  }

  function _abort() {
    abortRef.current?.abort();
    abortRef.current = null;
  }

  /** Process a parsed SSE event and update state accordingly. */
  const _handleEvent = useCallback(
    (event: SseEvent, onDone?: () => void) => {
      if (event.type === "token") {
        textBuffer.current += event.content;
        setState((s) => ({ ...s, streamingText: textBuffer.current }));
        return;
      }
      if (event.type === "eval") {
        setState((s) => ({ ...s, lastEval: event.content }));
        return;
      }
      if (event.type === "summary") {
        setState((s) => ({ ...s, summary: event.content, isStreaming: false }));
        return;
      }
      if (event.type === "done") {
        setState((s) => ({ ...s, isStreaming: false }));
        onDone?.();
        return;
      }
      if (event.type === "error") {
        setState((s) => ({ ...s, isStreaming: false, error: event.content }));
      }
    },
    [],
  );

  /** Open an SSE stream to the given path (POST or PUT). */
  const _openStream = useCallback(
    (
      path: string,
      method: "POST" | "PUT",
      body: Record<string, unknown> | null,
      onDone?: () => void,
    ) => {
      _abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      _resetStream();

      const init: FetchEventSourceInit = {
        method,
        headers: { "Content-Type": "application/json" },
        signal: ctrl.signal,
        openWhenHidden: true,

        async onopen(response) {
          if (!response.ok) {
            const text = await response.text();
            let detail = `HTTP ${response.status}`;
            try {
              detail = (JSON.parse(text) as { detail: string }).detail ?? detail;
            } catch { /* ignore */ }
            setState((s) => ({ ...s, isStreaming: false, error: detail }));
            ctrl.abort();
            return;
          }
          // Extract session ID from header on session creation
          const sid = response.headers.get("X-Session-Id");
          if (sid) setSessionId(sid);
        },

        onmessage(msg) {
          if (!msg.data) return;
          try {
            const event = JSON.parse(msg.data) as SseEvent;
            _handleEvent(event, onDone);
          } catch {
            // Malformed event — skip
          }
        },

        onerror(err) {
          if ((err as Error).name === "AbortError") return;
          setState((s) => ({
            ...s,
            isStreaming: false,
            error: "Connection lost. Please try again.",
          }));
          // Don't retry — throw to stop fetchEventSource's internal retry loop
          throw err;
        },
      };
      if (body !== null) init.body = JSON.stringify(body);

      void fetchEventSource(`${API_PREFIX}${path}`, init);
    },
    [_handleEvent],
  );

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /** Create a new session and stream the first question. */
  const createSession = useCallback(
    (request: CreateSessionRequest) => {
      setState(INITIAL_STATE);
      setSessionId(null);
      _openStream(
        "/interview/sessions",
        "POST",
        request as unknown as Record<string, unknown>,
        () => {
          // Invalidate session list when the stream completes
          void queryClient.invalidateQueries({ queryKey: ["interview", "sessions"] });
        },
      );
    },
    [_openStream, queryClient],
  );

  /** Send a user answer and stream the evaluation + next question. */
  const sendMessage = useCallback(
    (content: string) => {
      if (!sessionId) return;
      setState((s) => ({ ...s, lastEval: null }));
      _openStream(
        `/interview/sessions/${sessionId}/message`,
        "POST",
        { content },
        () => {
          if (sessionId) {
            void queryClient.invalidateQueries({
              queryKey: ["interview", "sessions", sessionId],
            });
          }
        },
      );
    },
    [sessionId, _openStream, queryClient],
  );

  /** End the session and stream the summary. */
  const endSession = useCallback(() => {
    if (!sessionId) return;
    _openStream(
      `/interview/sessions/${sessionId}/end`,
      "PUT",
      null,
      () => {
        void queryClient.invalidateQueries({ queryKey: ["interview", "sessions"] });
        if (sessionId) {
          void queryClient.invalidateQueries({
            queryKey: ["interview", "sessions", sessionId],
          });
        }
      },
    );
  }, [sessionId, _openStream, queryClient]);

  /** Abort any in-flight stream. */
  const abort = useCallback(() => {
    _abort();
    setState((s) => ({ ...s, isStreaming: false }));
  }, []);

  return {
    sessionId,
    state,
    createSession,
    sendMessage,
    endSession,
    abort,
  };
}
