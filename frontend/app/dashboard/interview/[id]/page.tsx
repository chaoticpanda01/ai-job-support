"use client";

import { use, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  isMissingSessionError,
  streamErrorMessage,
  useInterview,
  useInterviewSession,
} from "@/hooks/useInterview";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { useConfirm } from "@/components/confirm-dialog-provider";
import { LiveAnnouncer } from "@/components/live-announcer";
import { ApiClientError } from "@/lib/api-client";
import { useLang } from "@/lib/language-context";
import { t } from "@/lib/i18n";
import type { InterviewEvaluation, InterviewMessage, InterviewSummary } from "@/types/api";

// SendMessageRequest.content limit on the backend. Longer answers get a 422.
const MAX_ANSWER_LENGTH = 4000;

interface Props {
  params: Promise<{ id: string }>;
}

/** An answer shown before the server saved it, or an end request, still in flight. */
type PendingTurn =
  | { kind: "answer"; id: string; text: string; savedCount: number }
  | { kind: "end" };

export default function InterviewSessionPage({ params }: Props) {
  const { id } = use(params);
  const {
    data: session,
    error,
    fetchStatus,
    isFetching,
    errorUpdateCount,
    refetch,
  } = useInterviewSession(id);
  const { state, sendMessage, endSession, abort } = useInterview();
  const { lang } = useLang();
  const confirmDialog = useConfirm();

  const [input, setInput] = useState("");
  const [localMessages, setLocalMessages] = useState<InterviewMessage[]>([]);
  // Cleared when the turn's stream ends cleanly. On error or Stop it is undone.
  const pendingTurnRef = useRef<PendingTurn | null>(null);
  // Set while retrying from the full-page notice. With no data a retry puts the
  // query back to pending, which would otherwise swap the notice for the
  // skeleton and drop keyboard focus.
  const [retryingProblem, setRetryingProblem] = useState<LoadProblem | null>(null);

  const problem = loadProblemOf(error, fetchStatus === "paused");

  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (session?.messages) setLocalMessages(session.messages);
  }, [session]);

  // Undo a failed or stopped turn. An answer goes back in the input instead of
  // being lost. The backend saves it only together with its evaluation and the
  // next question, so a failed turn normally leaves nothing to duplicate. The
  // refetch catches a turn saved anyway, when the failure or Stop lands just
  // after the commit: the saved messages show, and the restored text is cleared
  // so it is not sent twice. After an end request it shows a session that was
  // completed anyway, which hides End.
  const undoPendingTurn = useCallback(() => {
    const pending = pendingTurnRef.current;
    if (!pending) return;
    pendingTurnRef.current = null;
    if (pending.kind === "answer") {
      setLocalMessages((prev) => prev.filter((m) => m.id !== pending.id));
      setInput(pending.text);
    }
    void refetch().then((result) => {
      // Only a successful refetch says whether the turn was saved. A failed one
      // returns the old data.
      if (
        pending.kind === "answer" &&
        result.status === "success" &&
        result.data.messages.length > pending.savedCount
      ) {
        setInput((current) => (current === pending.text ? "" : current));
      }
    });
  }, [refetch]);

  useEffect(() => {
    if (state.isStreaming || !pendingTurnRef.current) return;
    if (state.error) undoPendingTurn();
    else pendingTurnRef.current = null;
  }, [state.isStreaming, state.error, undoPendingTurn]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [localMessages, state.streamingText, state.lastEval, state.summary, problem]);

  // No data yet: the skeleton while it loads, otherwise why it didn't load (a
  // failed or offline-paused fetch). Before, the page showed only the header,
  // with no messages, no input and no explanation.
  if (!session) {
    const shown = problem ?? retryingProblem;
    if (!shown) return <PageSkeleton />;
    return (
      <div className="space-y-4">
        <Breadcrumbs
          items={[{ label: t("interview", "title", lang), href: "/dashboard/interview" }]}
        />
        <LoadProblemNotice
          problem={shown}
          variant="page"
          retrying={retryingProblem !== null}
          failureCount={errorUpdateCount}
          onRetry={() => {
            setRetryingProblem(shown);
            void refetch().finally(() => setRetryingProblem(null));
          }}
        />
      </div>
    );
  }

  // Ended only once the fetched status says so or the summary arrives, so a
  // failed end request leaves the input and End button in place to retry.
  const isActive = session.status === "active" && !state.summary;

  // Silent while tokens arrive, then one announcement when the stream closes.
  // After "done" the hook keeps streamingText until the next stream opens, so
  // the text is stable across re-renders and is not read twice. abort() clears
  // it, so a stopped reply is never announced as finished. On error the
  // role="alert" below speaks instead.
  const announcement =
    state.isStreaming || state.error
      ? ""
      : state.summary
        ? t("interview", "summaryReady", lang)
        : [
            state.lastEval ? t("interview", "feedbackReady", lang) : "",
            state.streamingText
              ? `${t("interview", "replyReady", lang)} ${state.streamingText}`
              : "",
          ]
            .filter(Boolean)
            .join(" ");

  function handleSend() {
    const text = input.trim();
    if (!text || state.isStreaming) return;

    const pendingId = crypto.randomUUID();
    pendingTurnRef.current = {
      kind: "answer",
      id: pendingId,
      text,
      savedCount: session?.messages.length ?? 0,
    };
    setLocalMessages((prev) => [
      ...prev,
      {
        id: pendingId,
        session_id: id,
        role: "user",
        content: text,
        language: session?.language ?? null,
        ai_evaluation: null,
        created_at: new Date().toISOString(),
      },
    ]);
    setInput("");
    sendMessage(id, text);
  }

  async function handleEnd() {
    const ok = await confirmDialog({
      title: t("interview", "endConfirm", lang),
      variant: "destructive",
      confirmLabel: t("common", "yes", lang),
      cancelLabel: t("common", "cancel", lang),
    });
    if (!ok) return;
    pendingTurnRef.current = { kind: "end" };
    endSession(id);
  }

  function handleStop() {
    abort();
    undoPendingTurn();
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col">
      <LiveAnnouncer message={announcement} />

      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b bg-background px-4 py-3">
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard/interview"
            aria-label={t("interview", "backToSessions", lang)}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            ←
          </Link>
          <div>
            <p className="text-sm font-medium">{`${capitalise(session.session_type)} Interview`}</p>
            {session.target_role && (
              <p className="text-xs text-muted-foreground">{session.target_role}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <StatusPill status={state.summary ? "completed" : session.status} />
          {isActive && !state.isStreaming && (
            <button
              onClick={handleEnd}
              className="rounded-md border px-3 py-1.5 text-xs hover:bg-accent"
            >
              {t("interview", "endSession", lang)}
            </button>
          )}
          {state.isStreaming && (
            <button
              onClick={handleStop}
              className="rounded-md border px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent"
            >
              {t("interview", "stop", lang)}
            </button>
          )}
        </div>
      </div>

      {/* Message list */}
      <div aria-busy={state.isStreaming} className="flex-1 overflow-y-auto px-4 py-6">
        <div className="mx-auto max-w-2xl space-y-6">
          {localMessages.map((msg) => (
            <MessageBubble key={msg.id} message={msg} sessionLanguage={session.language} />
          ))}

          {state.isStreaming && state.streamingText && (
            <StreamingBubble text={state.streamingText} language={session.language} />
          )}

          {state.lastEval && !state.isStreaming && <EvalCard eval={state.lastEval} />}

          {state.summary && <SummaryCard summary={state.summary} />}

          {state.error && (
            <p role="alert" className="text-center text-sm text-destructive">
              {streamErrorMessage(state.error, lang)}
            </p>
          )}

          {/* The next question arrives only through the refetch after "done" (the
              streaming bubble hides then). If that refetch fails or is paused
              offline, the answer and feedback show but the question doesn't, so
              say why. Hidden while a stream error shows: the refetch then only
              checks whether the failed turn was saved anyway. */}
          {problem && !state.error && (
            <LoadProblemNotice
              problem={problem}
              variant="inline"
              retrying={isFetching}
              failureCount={errorUpdateCount}
              onRetry={() => void refetch()}
            />
          )}

          <div ref={bottomRef} />
        </div>
      </div>

      {/* Input area */}
      {isActive && (
        <div className="shrink-0 border-t bg-background px-4 py-3">
          <div className="mx-auto flex max-w-2xl gap-2">
            <label htmlFor="interview-answer" className="sr-only">
              {t("interview", "answerLabel", lang)}
            </label>
            <textarea
              id="interview-answer"
              maxLength={MAX_ANSWER_LENGTH}
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={t("interview", "inputPlaceholder", lang)}
              rows={3}
              disabled={state.isStreaming}
              className="flex-1 resize-none rounded-md border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || state.isStreaming}
              className="self-end rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-40"
            >
              {state.isStreaming ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
              ) : (
                t("interview", "send", lang)
              )}
            </button>
          </div>
          <p className="mx-auto mt-1.5 max-w-2xl text-right text-xs text-muted-foreground">
            {t("interview", "enterHint", lang)}
          </p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Load problem notice
// ---------------------------------------------------------------------------

type LoadProblem = "offline" | "notFound" | "signedOut" | "failed";

/** Why the session query has nothing fresh to show, or null if nothing is wrong. */
function loadProblemOf(error: unknown, paused: boolean): LoadProblem | null {
  // A fetch started while offline pauses, with no error, until the connection returns.
  if (paused) return "offline";
  if (!error) return null;
  if (isMissingSessionError(error)) return "notFound";
  // Also sent when Clerk briefly fails to issue a token, so a retry can still work.
  if (error instanceof ApiClientError && error.status === 401) return "signedOut";
  return "failed";
}

const PROBLEM_MESSAGE_KEYS = {
  page: {
    offline: "sessionOffline",
    notFound: "sessionNotFound",
    signedOut: "sessionSignedOut",
    failed: "sessionLoadError",
  },
  inline: {
    offline: "sessionRefreshOffline",
    notFound: "sessionNotFound",
    signedOut: "sessionSignedOut",
    failed: "sessionRefreshError",
  },
} satisfies Record<"page" | "inline", Record<LoadProblem, string>>;

function LoadProblemNotice({
  problem,
  variant,
  retrying,
  failureCount,
  onRetry,
}: {
  problem: LoadProblem;
  variant: "page" | "inline";
  retrying: boolean;
  /** Changes when a retry fails, remounting the message so it is announced again. */
  failureCount: number;
  onRetry: () => void;
}) {
  const { lang } = useLang();
  const offline = problem === "offline";
  // Offline resumes on its own, and retrying can't find a missing session.
  const canRetry = problem === "failed" || problem === "signedOut";
  const tone = offline ? "text-muted-foreground" : "text-destructive";

  return (
    <div
      className={
        variant === "page" ? "space-y-3" : "flex flex-wrap items-center justify-center gap-2"
      }
    >
      <p
        key={failureCount}
        role={offline ? "status" : "alert"}
        className={
          variant === "page"
            ? `rounded-md px-3 py-2 text-sm ${offline ? "bg-muted" : "bg-destructive/10"} ${tone}`
            : `text-sm ${tone}`
        }
      >
        {t("interview", PROBLEM_MESSAGE_KEYS[variant][problem], lang)}
      </p>
      {canRetry && (
        // aria-disabled rather than disabled, so the button keeps keyboard focus
        // while the retry runs.
        <button
          type="button"
          onClick={() => {
            if (!retrying) onRetry();
          }}
          aria-disabled={retrying}
          className={`rounded-md border hover:bg-accent aria-disabled:opacity-50 ${
            variant === "page" ? "px-3 py-1.5 text-sm" : "px-2.5 py-1 text-xs"
          }`}
        >
          {t("common", retrying ? "retrying" : "tryAgain", lang)}
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Message bubble
// ---------------------------------------------------------------------------

// The interviewer is told to speak the session language. Answers can be in any
// language, so only interviewer text is tagged.
function MessageBubble({
  message,
  sessionLanguage,
}: {
  message: InterviewMessage;
  sessionLanguage: string | undefined;
}) {
  const isInterviewer = message.role === "interviewer";
  const { lang } = useLang();

  return (
    <div className={`flex ${isInterviewer ? "justify-start" : "justify-end"}`}>
      <div
        className={`max-w-[80%] space-y-2 rounded-2xl px-4 py-3 text-sm ${
          isInterviewer
            ? "rounded-tl-sm bg-muted text-foreground"
            : "rounded-tr-sm bg-primary text-primary-foreground"
        }`}
      >
        <p
          lang={isInterviewer ? sessionLanguage : undefined}
          className="whitespace-pre-wrap leading-relaxed"
        >
          {message.content}
        </p>
        <p
          className={`text-right text-xs ${
            isInterviewer ? "text-muted-foreground" : "text-primary-foreground/70"
          }`}
        >
          {new Date(message.created_at).toLocaleTimeString(lang, {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </p>
      </div>
    </div>
  );
}

function StreamingBubble({ text, language }: { text: string; language: string | undefined }) {
  return (
    <div className="flex justify-start">
      <div className="max-w-[80%] rounded-2xl rounded-tl-sm bg-muted px-4 py-3 text-sm">
        <p lang={language} className="whitespace-pre-wrap leading-relaxed">
          {text}
          <span className="ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-foreground align-middle" />
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Per-answer eval card
// ---------------------------------------------------------------------------

function EvalCard({ eval: e }: { eval: InterviewEvaluation }) {
  const { lang } = useLang();
  return (
    <div className="space-y-3 rounded-lg border bg-card p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {t("interview", "answerFeedback", lang)}
      </p>

      <div className="grid grid-cols-3 gap-3">
        <ScoreBar label={t("interview", "keigo", lang)} value={e.keigo_score} />
        <ScoreBar label={t("interview", "relevance", lang)} value={e.content_relevance} />
        <ScoreBar label={t("interview", "specificity", lang)} value={e.specificity_score} />
      </div>

      <div className="space-y-1.5 text-sm">
        <p className="text-green-700">
          <span className="font-medium">{t("interview", "goodLabel", lang)} </span>
          {e.positive_feedback}
        </p>
        <p className="text-amber-700">
          <span className="font-medium">{t("interview", "tipLabel", lang)} </span>
          {e.improvement_tip}
        </p>
      </div>

      {e.grammar_issues.length > 0 && (
        <div>
          <p className="mb-1 text-xs font-medium text-muted-foreground">
            {t("interview", "grammarNotes", lang)}
          </p>
          <ul className="space-y-0.5">
            {e.grammar_issues.map((issue, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
                {issue}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function ScoreBar({ label, value }: { label: string; value: number }) {
  const pct = Math.round(value);
  const color = pct >= 70 ? "bg-green-500" : pct >= 50 ? "bg-yellow-500" : "bg-red-500";
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium tabular-nums">{pct}</span>
      </div>
      <div className="h-1.5 rounded-full bg-muted">
        <div className={`h-1.5 rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// End-of-session summary card
// ---------------------------------------------------------------------------

function SummaryCard({ summary: s }: { summary: InterviewSummary }) {
  const { lang } = useLang();
  const score = Math.round(s.overall_score);
  const scoreColor =
    score >= 70 ? "text-green-600" : score >= 50 ? "text-yellow-600" : "text-red-600";
  const readiness =
    score >= 80
      ? t("interview", "readiness80", lang)
      : score >= 60
        ? t("interview", "readiness60", lang)
        : score >= 40
          ? t("interview", "readiness40", lang)
          : t("interview", "readiness0", lang);

  return (
    <div className="space-y-5 rounded-xl border-2 border-primary/20 bg-card p-6">
      <div className="flex items-center gap-4">
        <div className="text-center">
          <p className={`text-5xl font-bold tabular-nums ${scoreColor}`}>{score}</p>
          <p className={`mt-0.5 text-sm font-medium ${scoreColor}`}>{readiness}</p>
        </div>
        <div>
          <p className="text-sm font-semibold">{t("interview", "sessionComplete", lang)}</p>
          <p className="mt-1 text-sm text-muted-foreground">{s.feedback_summary}</p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {s.top_strengths.length > 0 && (
          <BulletList
            title={t("interview", "strengthsLabel", lang)}
            items={s.top_strengths}
            dot="bg-green-500"
          />
        )}
        {s.top_improvements.length > 0 && (
          <BulletList
            title={t("interview", "improvementsLabel", lang)}
            items={s.top_improvements}
            dot="bg-amber-500"
          />
        )}
      </div>

      <div className="flex justify-end">
        <Link
          href="/dashboard/interview"
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          {t("interview", "backToSessions", lang)}
        </Link>
      </div>
    </div>
  );
}

function BulletList({ title, items, dot }: { title: string; items: string[]; dot: string }) {
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </p>
      <ul className="space-y-1.5">
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-2 text-sm">
            <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const { lang } = useLang();
  const styles: Record<string, string> = {
    active: "bg-green-100 text-green-800",
    completed: "bg-blue-100 text-blue-800",
    abandoned: "bg-muted text-muted-foreground",
  };
  const label =
    status === "active"
      ? t("interview", "statusActive", lang)
      : status === "completed"
        ? t("interview", "statusCompleted", lang)
        : t("interview", "statusAbandoned", lang);

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${styles[status] ?? styles["abandoned"]}`}
    >
      {status === "active" && (
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-green-500" />
      )}
      {label}
    </span>
  );
}

function capitalise(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, " ");
}

function PageSkeleton() {
  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col">
      <div className="h-14 animate-pulse border-b bg-muted" />
      <div className="flex-1 space-y-4 p-6">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className={`h-16 w-2/3 animate-pulse rounded-2xl bg-muted ${i % 2 === 1 ? "ml-auto" : ""}`}
          />
        ))}
      </div>
    </div>
  );
}
