"use client";

import { useCallback, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchEventSource, type FetchEventSourceInit } from "@microsoft/fetch-event-source";
import { apiClient, extractDetail } from "@/lib/api-client";
import { t, type Language } from "@/lib/i18n";
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

/**
 * Why a stream failed. Failures the client detects are stored by kind and
 * translated at render, so the message follows the current language. Text the
 * server sent is shown untranslated.
 */
export type StreamError =
  /** Non-empty text from the server: an SSE "error" event or an HTTP error's detail. */
  | { kind: "server"; message: string }
  /** An error with no usable text: a non-JSON body, a missing or empty detail, or an empty SSE error. */
  | { kind: "failed" }
  /** The response ended without a terminal event. */
  | { kind: "ended" }
  /** The request could not complete: a network failure before or during the stream. */
  | { kind: "connection" };

export function streamErrorMessage(error: StreamError, lang: Language): string {
  switch (error.kind) {
    case "server":
      return error.message;
    case "failed":
      return t("common", "error", lang);
    case "ended":
      return t("interview", "streamEnded", lang);
    case "connection":
      return t("interview", "connectionLost", lang);
  }
}

/**
 * State after a stream fails or is stopped. Feedback the stream sent is dropped
 * with it: the backend saves an answer only together with its whole turn, so
 * that feedback is for an answer that was not saved.
 */
function interruptedState(
  s: StreamState,
  error: StreamError | null,
  evalSent: boolean,
): StreamState {
  return { ...s, isStreaming: false, error, lastEval: evalSent ? null : s.lastEval };
}

export interface StreamState {
  /** Tokens accumulated from the current streamed message */
  streamingText: string;
  /** Whether a stream is in flight */
  isStreaming: boolean;
  /** Last received evaluation (for the user's previous answer) */
  lastEval: InterviewEvaluation | null;
  /** Session summary (populated after end session) */
  summary: InterviewSummary | null;
  /** Why the stream failed, if it did. Render with streamErrorMessage. */
  error: StreamError | null;
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
  // Whether the current stream has sent an evaluation, for interruptedState.
  const evalInStream = useRef(false);

  function _resetStream() {
    textBuffer.current = "";
    evalInStream.current = false;
    setState((s) => ({ ...s, streamingText: "", isStreaming: true, error: null }));
  }

  function _abort() {
    abortRef.current?.abort();
    abortRef.current = null;
  }

  /** Process a parsed SSE event and update state accordingly. */
  const _handleEvent = useCallback((event: SseEvent, onDone?: () => void) => {
    if (event.type === "token") {
      textBuffer.current += event.content;
      setState((s) => ({ ...s, streamingText: textBuffer.current }));
      return;
    }
    if (event.type === "eval") {
      evalInStream.current = true;
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
      // An empty message would render a blank alert.
      const error: StreamError = event.content
        ? { kind: "server", message: event.content }
        : { kind: "failed" };
      setState((s) => interruptedState(s, error, evalInStream.current));
    }
  }, []);

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
            let error: StreamError = { kind: "failed" };
            try {
              // extractDetail flattens a 422's array-of-objects detail into text; "" means none.
              const detail = extractDetail((JSON.parse(text) as { detail?: unknown }).detail, "");
              if (detail) error = { kind: "server", message: detail };
            } catch {
              /* body is not a JSON object: keep the "failed" kind */
            }
            setState((s) => interruptedState(s, error, evalInStream.current));
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

        onclose() {
          // The response ended without a "done", "summary", or "error" event:
          // a dropped proxy connection, or a terminal event that failed to
          // parse. The library does not retry a clean close, so without this
          // isStreaming would stay true forever. Ignore a stream that a newer
          // one has already replaced.
          if (abortRef.current !== ctrl) return;
          setState((s) =>
            s.isStreaming ? interruptedState(s, { kind: "ended" }, evalInStream.current) : s,
          );
        },

        onerror(err) {
          if ((err as Error).name === "AbortError") return;
          setState((s) => interruptedState(s, { kind: "connection" }, evalInStream.current));
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

  // sendMessage and endSession take the session id instead of reading
  // `sessionId`: that state is only set by a stream this instance opened, and
  // the session page mounts a fresh instance after createSession navigates
  // there, so it would stay null and both calls would silently do nothing.

  /** Send a user answer and stream the evaluation + next question. */
  const sendMessage = useCallback(
    (id: string, content: string) => {
      setState((s) => ({ ...s, lastEval: null }));
      _openStream(`/interview/sessions/${id}/message`, "POST", { content }, () => {
        void queryClient.invalidateQueries({
          queryKey: ["interview", "sessions", id],
        });
      });
    },
    [_openStream, queryClient],
  );

  /** End the session and stream the summary. */
  const endSession = useCallback(
    (id: string) => {
      _openStream(`/interview/sessions/${id}/end`, "PUT", null, () => {
        void queryClient.invalidateQueries({ queryKey: ["interview", "sessions"] });
        void queryClient.invalidateQueries({
          queryKey: ["interview", "sessions", id],
        });
      });
    },
    [_openStream, queryClient],
  );

  /**
   * Abort any in-flight stream. The partial reply is dropped: it is no longer
   * shown once streaming stops, and keeping it would let the page announce a
   * stopped reply as if it had finished. So is feedback the stream sent.
   */
  const abort = useCallback(() => {
    _abort();
    textBuffer.current = "";
    setState((s) => ({
      ...interruptedState(s, s.error, evalInStream.current),
      streamingText: "",
    }));
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
