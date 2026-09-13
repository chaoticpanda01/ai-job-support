"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { streamErrorMessage, useInterview } from "@/hooks/useInterview";
import {
  INTERVIEW_LANGUAGES,
  INTERVIEW_TYPES,
  interviewLanguageOption,
  interviewTypeDescription,
  interviewTypeLabel,
} from "@/lib/interview-labels";
import { useLang } from "@/lib/language-context";
import { t } from "@/lib/i18n";
import type { InterviewLanguage, InterviewType } from "@/types/api";

export default function NewInterviewPage() {
  const router = useRouter();
  const { sessionId, state, createSession } = useInterview();
  const { lang } = useLang();

  const [sessionType, setSessionType] = useState<InterviewType>("general");
  const [language, setLanguage] = useState<InterviewLanguage>("ja");
  const [targetRole, setTargetRole] = useState("");
  const [targetCompany, setTargetCompany] = useState("");

  // Leave only after the stream ends with no error: the backend sends done after
  // saving the question. The session id arrives in the response headers, before
  // the question is generated, so leaving then would drop a generation error on
  // this unmounted page and open an empty chat.
  const ready = sessionId !== null && !state.isStreaming && state.error === null;

  useEffect(() => {
    if (ready) router.push(`/dashboard/interview/${sessionId}`);
  }, [ready, router, sessionId]);

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
          {t("interview", "backToList", lang)}
        </Link>
        <h1 className="mt-4 text-2xl font-semibold">{t("interview", "newTitle", lang)}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("interview", "newSub", lang)}</p>
      </div>

      <div className="space-y-6">
        {/* Session type */}
        <div className="space-y-2">
          <p className="text-sm font-medium">{t("interview", "interviewType", lang)}</p>
          <ul className="space-y-2">
            {INTERVIEW_TYPES.map((type) => (
              <li key={type}>
                <label className="flex cursor-pointer items-start gap-3 rounded-lg border bg-card p-4 hover:bg-accent has-[:checked]:border-primary">
                  <input
                    type="radio"
                    name="session_type"
                    value={type}
                    checked={sessionType === type}
                    onChange={() => setSessionType(type)}
                    className="mt-0.5 accent-primary"
                  />
                  <div>
                    <p className="text-sm font-medium">{interviewTypeLabel(type, lang)}</p>
                    <p className="text-xs text-muted-foreground">
                      {interviewTypeDescription(type, lang)}
                    </p>
                  </div>
                </label>
              </li>
            ))}
          </ul>
        </div>

        {/* Language */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium" htmlFor="language">
            {t("interview", "interviewLang", lang)}
          </label>
          <select
            id="language"
            value={language}
            onChange={(e) => setLanguage(e.target.value as InterviewLanguage)}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          >
            {INTERVIEW_LANGUAGES.map((code) => (
              <option key={code} value={code}>
                {interviewLanguageOption(code, lang)}
              </option>
            ))}
          </select>
        </div>

        {/* Optional context */}
        <div className="space-y-3">
          <p className="text-sm font-medium">
            {t("interview", "context", lang)}{" "}
            <span className="font-normal text-muted-foreground">
              ({t("interview", "contextHint", lang)})
            </span>
          </p>
          <input
            type="text"
            value={targetRole}
            onChange={(e) => setTargetRole(e.target.value)}
            placeholder={t("interview", "rolePlaceholder", lang)}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <input
            type="text"
            value={targetCompany}
            onChange={(e) => setTargetCompany(e.target.value)}
            placeholder={t("interview", "companyPlaceholder", lang)}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        {state.error && (
          <p
            role="alert"
            className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {streamErrorMessage(state.error, lang)}
          </p>
        )}

        <button
          onClick={handleStart}
          disabled={state.isStreaming || ready}
          className="w-full rounded-md bg-primary py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {state.isStreaming || ready ? (
            <span className="flex items-center justify-center gap-2">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
              {t("interview", "starting", lang)}
            </span>
          ) : (
            t("interview", "startBtn", lang)
          )}
        </button>
      </div>
    </div>
  );
}
