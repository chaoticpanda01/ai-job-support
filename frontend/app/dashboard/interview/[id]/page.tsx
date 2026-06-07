"use client";

import { use, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useInterview, useInterviewSession } from "@/hooks/useInterview";
import { useLang } from "@/lib/language-context";
import { t } from "@/lib/i18n";
import type { InterviewEvaluation, InterviewMessage, InterviewSummary } from "@/types/api";

interface Props {
  params: Promise<{ id: string }>;
}

export default function InterviewSessionPage({ params }: Props) {
  const { id } = use(params);
  const { data: session, isLoading } = useInterviewSession(id);
  const {
    sessionId: activeId,
    state,
    sendMessage,
    endSession,
    abort,
  } = useInterview();
  const { lang } = useLang();

  const resolvedSessionId = activeId ?? id;

  const [input, setInput] = useState("");
  const [localMessages, setLocalMessages] = useState<InterviewMessage[]>([]);
  const [ended, setEnded] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (session?.messages) {
      setLocalMessages(session.messages);
      if (session.status !== "active") setEnded(true);
    }
  }, [session]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [localMessages, state.streamingText, state.lastEval, state.summary]);

  if (isLoading) return <PageSkeleton />;

  const isActive = !ended && session?.status === "active";

  function handleSend() {
    const text = input.trim();
    if (!text || state.isStreaming) return;

    setLocalMessages((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        session_id: resolvedSessionId,
        role: "user",
        content: text,
        language: session?.language ?? null,
        ai_evaluation: null,
        created_at: new Date().toISOString(),
      },
    ]);
    setInput("");
    sendMessage(text);
  }

  function handleEnd() {
    if (!confirm(t("interview", "endConfirm", lang))) return;
    setEnded(true);
    endSession();
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b bg-background px-4 py-3">
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard/interview"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            ←
          </Link>
          <div>
            <p className="text-sm font-medium">
              {session
                ? `${capitalise(session.session_type)} Interview`
                : t("interview", "sessionTitle", lang)}
            </p>
            {session?.target_role && (
              <p className="text-xs text-muted-foreground">{session.target_role}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <StatusPill status={ended ? "completed" : (session?.status ?? "active")} />
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
              onClick={abort}
              className="rounded-md border px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent"
            >
              {t("interview", "stop", lang)}
            </button>
          )}
        </div>
      </div>

      {/* Message list */}
      <div className="flex-1 overflow-y-auto px-4 py-6">
        <div className="mx-auto max-w-2xl space-y-6">
          {localMessages.map((msg) => (
            <MessageBubble key={msg.id} message={msg} />
          ))}

          {state.isStreaming && state.streamingText && (
            <StreamingBubble text={state.streamingText} />
          )}

          {state.lastEval && !state.isStreaming && (
            <EvalCard eval={state.lastEval} />
          )}

          {state.summary && (
            <SummaryCard summary={state.summary} />
          )}

          {state.error && (
            <p className="text-center text-sm text-destructive">{state.error}</p>
          )}

          <div ref={bottomRef} />
        </div>
      </div>

      {/* Input area */}
      {isActive && (
        <div className="shrink-0 border-t bg-background px-4 py-3">
          <div className="mx-auto flex max-w-2xl gap-2">
            <textarea
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
// Message bubble
// ---------------------------------------------------------------------------

function MessageBubble({ message }: { message: InterviewMessage }) {
  const isInterviewer = message.role === "interviewer";

  return (
    <div className={`flex ${isInterviewer ? "justify-start" : "justify-end"}`}>
      <div
        className={`max-w-[80%] space-y-2 rounded-2xl px-4 py-3 text-sm ${
          isInterviewer
            ? "rounded-tl-sm bg-muted text-foreground"
            : "rounded-tr-sm bg-primary text-primary-foreground"
        }`}
      >
        <p className="whitespace-pre-wrap leading-relaxed">{message.content}</p>
        <p
          className={`text-right text-xs ${
            isInterviewer ? "text-muted-foreground" : "text-primary-foreground/70"
          }`}
        >
          {new Date(message.created_at).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </p>
      </div>
    </div>
  );
}

function StreamingBubble({ text }: { text: string }) {
  return (
    <div className="flex justify-start">
      <div className="max-w-[80%] rounded-2xl rounded-tl-sm bg-muted px-4 py-3 text-sm">
        <p className="whitespace-pre-wrap leading-relaxed">
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
    <div className="rounded-lg border bg-card p-4 space-y-3">
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
  const color =
    pct >= 70 ? "bg-green-500" : pct >= 50 ? "bg-yellow-500" : "bg-red-500";
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="tabular-nums font-medium">{pct}</span>
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
    <div className="rounded-xl border-2 border-primary/20 bg-card p-6 space-y-5">
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
    active:    "bg-green-100 text-green-800",
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
