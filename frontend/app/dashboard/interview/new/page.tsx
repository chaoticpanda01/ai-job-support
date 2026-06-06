"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useInterview } from "@/hooks/useInterview";
import type { InterviewLanguage, InterviewType } from "@/types/api";

const SESSION_TYPES: { value: InterviewType; label: string; description: string }[] = [
  {
    value: "general",
    label: "General",
    description: "Self-introduction, motivation, and career goals — ideal for first practice.",
  },
  {
    value: "behavioral",
    label: "Behavioural",
    description: "STAR-method questions about past experience and how you handled situations.",
  },
  {
    value: "technical",
    label: "Technical",
    description: "Role-specific technical questions tailored to your target field.",
  },
  {
    value: "culture_fit",
    label: "Culture Fit",
    description: "Japanese workplace culture: teamwork, 報連相, adaptability, and values.",
  },
];

const LANGUAGES: { value: InterviewLanguage; label: string }[] = [
  { value: "ja", label: "Japanese (日本語)" },
  { value: "en", label: "English" },
  { value: "id", label: "Indonesian (Bahasa Indonesia)" },
];

export default function NewInterviewPage() {
  const router = useRouter();
  const { sessionId, state, createSession } = useInterview();

  const [sessionType, setSessionType] = useState<InterviewType>("general");
  const [language, setLanguage] = useState<InterviewLanguage>("ja");
  const [targetRole, setTargetRole] = useState("");
  const [targetCompany, setTargetCompany] = useState("");

  // Once we have a session ID, redirect to the chat page
  if (sessionId) {
    router.push(`/dashboard/interview/${sessionId}`);
    return null;
  }

  function handleStart() {
    createSession({
      session_type: sessionType,
      language,
      ...(targetRole.trim() ? { target_role: targetRole.trim() } : {}),
      ...(targetCompany.trim() ? { target_company: targetCompany.trim() } : {}),
    });
  }

  return (
    <div className="mx-auto max-w-lg space-y-8">
      <div>
        <Link
          href="/dashboard/interview"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          ← Back
        </Link>
        <h1 className="mt-4 text-2xl font-semibold">Start a Mock Interview</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Practice with an AI interviewer and get real-time feedback on each answer.
        </p>
      </div>

      <div className="space-y-6">
        {/* Session type */}
        <div className="space-y-2">
          <p className="text-sm font-medium">Interview type</p>
          <ul className="space-y-2">
            {SESSION_TYPES.map((t) => (
              <li key={t.value}>
                <label className="flex cursor-pointer items-start gap-3 rounded-lg border bg-card p-4 hover:bg-accent has-[:checked]:border-primary">
                  <input
                    type="radio"
                    name="session_type"
                    value={t.value}
                    checked={sessionType === t.value}
                    onChange={() => setSessionType(t.value)}
                    className="mt-0.5 accent-primary"
                  />
                  <div>
                    <p className="text-sm font-medium">{t.label}</p>
                    <p className="text-xs text-muted-foreground">{t.description}</p>
                  </div>
                </label>
              </li>
            ))}
          </ul>
        </div>

        {/* Language */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium" htmlFor="language">
            Interview language
          </label>
          <select
            id="language"
            value={language}
            onChange={(e) => setLanguage(e.target.value as InterviewLanguage)}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          >
            {LANGUAGES.map((l) => (
              <option key={l.value} value={l.value}>
                {l.label}
              </option>
            ))}
          </select>
        </div>

        {/* Optional context */}
        <div className="space-y-3">
          <p className="text-sm font-medium">
            Context{" "}
            <span className="font-normal text-muted-foreground">(optional — improves question quality)</span>
          </p>
          <input
            type="text"
            value={targetRole}
            onChange={(e) => setTargetRole(e.target.value)}
            placeholder="Target role (e.g. Software Engineer)"
            className="w-full rounded-md border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <input
            type="text"
            value={targetCompany}
            onChange={(e) => setTargetCompany(e.target.value)}
            placeholder="Target company (e.g. Toyota)"
            className="w-full rounded-md border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        {state.error && (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {state.error}
          </p>
        )}

        <button
          onClick={handleStart}
          disabled={state.isStreaming}
          className="w-full rounded-md bg-primary py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {state.isStreaming ? (
            <span className="flex items-center justify-center gap-2">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
              Starting session…
            </span>
          ) : (
            "Start interview"
          )}
        </button>
      </div>
    </div>
  );
}
