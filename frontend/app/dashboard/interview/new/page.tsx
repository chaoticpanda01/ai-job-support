"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { RadioCard } from "@/components/ui/radio-card";
import { Select } from "@/components/ui/select";
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

// useSearchParams needs a Suspense boundary, as on the new-document pages.
export default function NewInterviewPage() {
  return (
    <Suspense>
      <NewInterviewForm />
    </Suspense>
  );
}

function NewInterviewForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { sessionId, state, createSession } = useInterview();
  const { lang } = useLang();

  const [sessionType, setSessionType] = useState<InterviewType>("general");
  const [language, setLanguage] = useState<InterviewLanguage>("ja");
  // A job's stage panel links here with the role and company filled in.
  const [targetRole, setTargetRole] = useState(() => searchParams.get("role") ?? "");
  const [targetCompany, setTargetCompany] = useState(() => searchParams.get("company") ?? "");

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
      <Breadcrumbs
        items={[
          { label: t("interview", "title", lang), href: "/dashboard/interview" },
          { label: t("interview", "newTitle", lang) },
        ]}
      />
      <PageHeader
        className="mb-0"
        title={t("interview", "newTitle", lang)}
        description={t("interview", "newSub", lang)}
      />

      <div className="space-y-6">
        <fieldset className="space-y-2">
          <legend className="mb-2 text-sm font-medium">
            {t("interview", "interviewType", lang)}
          </legend>
          <ul className="space-y-2">
            {INTERVIEW_TYPES.map((type) => (
              <li key={type}>
                <RadioCard
                  name="session_type"
                  value={type}
                  checked={sessionType === type}
                  onChange={() => setSessionType(type)}
                >
                  <p className="text-sm font-medium">{interviewTypeLabel(type, lang)}</p>
                  <p className="text-xs text-muted-foreground">
                    {interviewTypeDescription(type, lang)}
                  </p>
                </RadioCard>
              </li>
            ))}
          </ul>
        </fieldset>

        <Field label={t("interview", "interviewLang", lang)}>
          <Select
            value={language}
            onChange={(e) => setLanguage(e.target.value as InterviewLanguage)}
          >
            {INTERVIEW_LANGUAGES.map((code) => (
              <option key={code} value={code}>
                {interviewLanguageOption(code, lang)}
              </option>
            ))}
          </Select>
        </Field>

        <fieldset className="space-y-4">
          <legend className="text-sm font-medium">
            {t("interview", "context", lang)}{" "}
            <span className="font-normal text-muted-foreground">
              ({t("interview", "contextHint", lang)})
            </span>
          </legend>
          <Field
            label={t("interview", "roleLabel", lang)}
            optionalLabel={t("settings", "optional", lang)}
          >
            <Input
              value={targetRole}
              onChange={(e) => setTargetRole(e.target.value)}
              placeholder={t("interview", "rolePlaceholder", lang)}
            />
          </Field>
          <Field
            label={t("interview", "companyLabel", lang)}
            optionalLabel={t("settings", "optional", lang)}
          >
            <Input
              value={targetCompany}
              onChange={(e) => setTargetCompany(e.target.value)}
              placeholder={t("interview", "companyPlaceholder", lang)}
            />
          </Field>
        </fieldset>

        {state.error && <Alert>{streamErrorMessage(state.error, lang)}</Alert>}

        <Button className="w-full" onClick={handleStart} loading={state.isStreaming || ready}>
          {state.isStreaming || ready
            ? t("interview", "starting", lang)
            : t("interview", "startBtn", lang)}
        </Button>
      </div>
    </div>
  );
}
