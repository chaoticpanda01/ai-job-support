"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMe, useUpdateProfile, useRecordConsent } from "@/hooks/useMe";
import type { JapaneseLevel, PreferredLanguage, VisaStatus } from "@/types/api";

// ---------------------------------------------------------------------------
// Step schemas
// ---------------------------------------------------------------------------

const step2Schema = z.object({
  full_name: z.string().min(1, "Name is required"),
  preferred_language: z.enum(["id", "en", "ja"] as const),
});

const step3Schema = z.object({
  nationality: z.string().min(1, "Nationality is required"),
  current_location: z.string().min(1, "Current location is required"),
  target_location: z.string().min(1, "Target location in Japan is required"),
  years_experience: z.coerce.number().min(0).max(80),
});

const step4Schema = z.object({
  japanese_level: z.enum(["N1", "N2", "N3", "N4", "N5", "none"] as const),
  visa_status: z.enum(["none", "pending", "held"] as const),
  target_industry: z.string().min(1, "Enter at least one industry"),
  target_role: z.string().min(1, "Enter at least one role"),
});

type Step2Data = z.infer<typeof step2Schema>;
type Step3Data = z.infer<typeof step3Schema>;
type Step4Data = z.infer<typeof step4Schema>;

const TOTAL_STEPS = 4;

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function OnboardingPage() {
  const router = useRouter();
  const { data: me } = useMe();
  const updateProfile = useUpdateProfile();
  const recordConsent = useRecordConsent();
  const [step, setStep] = useState(1);
  const [error, setError] = useState<string | null>(null);

  // If already completed, redirect
  useEffect(() => {
    if (me?.profile?.onboarding_completed) {
      router.replace("/dashboard/resumes");
    }
  }, [me?.profile?.onboarding_completed, router]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-muted/40 p-4">
      <div className="w-full max-w-lg rounded-xl border bg-card p-8 shadow-sm">
        {/* Progress header */}
        <div className="mb-8">
          <p className="text-sm font-medium text-muted-foreground">
            Step {step} of {TOTAL_STEPS}
          </p>
          <div className="mt-2 h-1.5 w-full rounded-full bg-muted">
            <div
              className="h-1.5 rounded-full bg-primary transition-all duration-300"
              style={{ width: `${(step / TOTAL_STEPS) * 100}%` }}
            />
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {/* Step 1 — Consent */}
        {step === 1 && (
          <Step1Consent
            onNext={async () => {
              setError(null);
              try {
                await recordConsent.mutateAsync();
                setStep(2);
              } catch {
                setError("Something went wrong. Please try again.");
              }
            }}
            loading={recordConsent.isPending}
          />
        )}

        {/* Step 2 — Name + language */}
        {step === 2 && (
          <Step2
            onNext={async (data) => {
              setError(null);
              try {
                await updateProfile.mutateAsync({
                  preferred_language: data.preferred_language,
                  onboarding_step: 1,
                });
                setStep(3);
              } catch {
                setError("Something went wrong. Please try again.");
              }
            }}
            onBack={() => setStep(1)}
            loading={updateProfile.isPending}
          />
        )}

        {/* Step 3 — Location + experience */}
        {step === 3 && (
          <Step3
            onNext={async (data) => {
              setError(null);
              try {
                await updateProfile.mutateAsync({
                  nationality: data.nationality,
                  current_location: data.current_location,
                  target_location: data.target_location,
                  years_experience: data.years_experience,
                  onboarding_step: 2,
                });
                setStep(4);
              } catch {
                setError("Something went wrong. Please try again.");
              }
            }}
            onBack={() => setStep(2)}
            loading={updateProfile.isPending}
          />
        )}

        {/* Step 4 — Japanese level + preferences */}
        {step === 4 && (
          <Step4
            onNext={async (data) => {
              setError(null);
              try {
                await updateProfile.mutateAsync({
                  japanese_level: data.japanese_level as JapaneseLevel,
                  visa_status: data.visa_status as VisaStatus,
                  target_industry: data.target_industry
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean),
                  target_role: data.target_role
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean),
                  onboarding_step: 4,
                });
                router.push("/dashboard/resumes");
              } catch {
                setError("Something went wrong. Please try again.");
              }
            }}
            onBack={() => setStep(3)}
            loading={updateProfile.isPending}
          />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 1 — AI processing consent (Section 8.4)
// ---------------------------------------------------------------------------

function Step1Consent({
  onNext,
  loading,
}: {
  onNext: () => Promise<void>;
  loading: boolean;
}) {
  const [checked, setChecked] = useState(false);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Before we begin</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Japan Job Support uses AI to analyse your resume and generate career documents.
          Please read and accept the following before continuing.
        </p>
      </div>

      <div className="rounded-lg border bg-muted/40 p-4 text-sm text-muted-foreground space-y-2">
        <p>By continuing, you agree that Japan Job Support may:</p>
        <ul className="ml-4 list-disc space-y-1">
          <li>
            Process the content of your uploaded resume using the Anthropic Claude API
            to generate analysis, career documents, and job-match scores.
          </li>
          <li>
            Store AI-generated results (scores, translations, documents) in our
            database to provide the service.
          </li>
          <li>
            Send anonymised usage data to Anthropic as part of normal API operation.
            Your personal details are never used to train AI models.
          </li>
        </ul>
        <p>
          You can withdraw consent at any time by deleting your account from{" "}
          <span className="font-medium text-foreground">Settings → Danger zone</span>.
        </p>
      </div>

      <label className="flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => setChecked(e.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 accent-primary"
        />
        <span className="text-sm">
          I understand and consent to AI processing of my resume data as described above.
        </span>
      </label>

      <button
        onClick={onNext}
        disabled={!checked || loading}
        className="flex w-full items-center justify-center rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {loading ? "Saving…" : "I agree — continue"}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 2 — Name + language
// ---------------------------------------------------------------------------

function Step2({
  onNext,
  onBack,
  loading,
}: {
  onNext: (data: Step2Data) => Promise<void>;
  onBack: () => void;
  loading: boolean;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Step2Data>({
    resolver: zodResolver(step2Schema),
    defaultValues: { preferred_language: "id" },
  });

  return (
    <form onSubmit={handleSubmit(onNext)} className="space-y-5">
      <h1 className="text-2xl font-semibold">Welcome! Let's get started</h1>
      <p className="text-sm text-muted-foreground">Tell us your name and preferred language.</p>

      <Field label="Full name" error={errors.full_name?.message}>
        <input {...register("full_name")} placeholder="Budi Santoso" className={inputCls} />
      </Field>

      <Field label="Preferred language" error={errors.preferred_language?.message}>
        <select {...register("preferred_language")} className={inputCls}>
          <option value="id">Indonesian (Bahasa Indonesia)</option>
          <option value="en">English</option>
          <option value="ja">Japanese (日本語)</option>
        </select>
      </Field>

      <div className="flex gap-3">
        <button type="button" onClick={onBack} className={secondaryBtnCls}>
          Back
        </button>
        <SubmitBtn loading={loading}>Continue</SubmitBtn>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Step 3 — Location + experience
// ---------------------------------------------------------------------------

function Step3({
  onNext,
  onBack,
  loading,
}: {
  onNext: (data: Step3Data) => Promise<void>;
  onBack: () => void;
  loading: boolean;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Step3Data>({
    resolver: zodResolver(step3Schema),
    defaultValues: { nationality: "Indonesian" },
  });

  return (
    <form onSubmit={handleSubmit(onNext)} className="space-y-5">
      <h1 className="text-2xl font-semibold">Your background</h1>
      <p className="text-sm text-muted-foreground">Help us tailor your Japan job search.</p>

      <Field label="Nationality" error={errors.nationality?.message}>
        <input {...register("nationality")} placeholder="Indonesian" className={inputCls} />
      </Field>

      <Field label="Current location" error={errors.current_location?.message}>
        <input
          {...register("current_location")}
          placeholder="Jakarta, Indonesia"
          className={inputCls}
        />
      </Field>

      <Field label="Target location in Japan" error={errors.target_location?.message}>
        <input {...register("target_location")} placeholder="Tokyo" className={inputCls} />
      </Field>

      <Field label="Years of work experience" error={errors.years_experience?.message}>
        <input
          {...register("years_experience")}
          type="number"
          min={0}
          max={80}
          className={inputCls}
        />
      </Field>

      <div className="flex gap-3">
        <button type="button" onClick={onBack} className={secondaryBtnCls}>
          Back
        </button>
        <SubmitBtn loading={loading}>Continue</SubmitBtn>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Step 4 — Japanese level + job preferences
// ---------------------------------------------------------------------------

function Step4({
  onNext,
  onBack,
  loading,
}: {
  onNext: (data: Step4Data) => Promise<void>;
  onBack: () => void;
  loading: boolean;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Step4Data>({
    resolver: zodResolver(step4Schema),
    defaultValues: { japanese_level: "none", visa_status: "none" },
  });

  return (
    <form onSubmit={handleSubmit(onNext)} className="space-y-5">
      <h1 className="text-2xl font-semibold">Japanese & preferences</h1>
      <p className="text-sm text-muted-foreground">
        This helps us score your resume for the Japanese market.
      </p>

      <Field label="Japanese level" error={errors.japanese_level?.message}>
        <select {...register("japanese_level")} className={inputCls}>
          <option value="none">No Japanese</option>
          <option value="N5">N5 — Basic</option>
          <option value="N4">N4 — Elementary</option>
          <option value="N3">N3 — Intermediate</option>
          <option value="N2">N2 — Upper-intermediate</option>
          <option value="N1">N1 — Advanced</option>
        </select>
      </Field>

      <Field label="Visa status" error={errors.visa_status?.message}>
        <select {...register("visa_status")} className={inputCls}>
          <option value="none">No visa yet</option>
          <option value="pending">Application in progress</option>
          <option value="held">Already holding a visa</option>
        </select>
      </Field>

      <Field
        label="Target industries (comma-separated)"
        error={errors.target_industry?.message}
      >
        <input
          {...register("target_industry")}
          placeholder="IT, Manufacturing, Finance"
          className={inputCls}
        />
      </Field>

      <Field label="Target roles (comma-separated)" error={errors.target_role?.message}>
        <input
          {...register("target_role")}
          placeholder="Software Engineer, Project Manager"
          className={inputCls}
        />
      </Field>

      <div className="flex gap-3">
        <button type="button" onClick={onBack} className={secondaryBtnCls}>
          Back
        </button>
        <SubmitBtn loading={loading}>Complete setup</SubmitBtn>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Shared UI
// ---------------------------------------------------------------------------

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-foreground">{label}</label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

function SubmitBtn({ children, loading }: { children: React.ReactNode; loading: boolean }) {
  return (
    <button
      type="submit"
      disabled={loading}
      className="flex w-full items-center justify-center rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
    >
      {loading ? "Saving…" : children}
    </button>
  );
}

const inputCls =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2";

const secondaryBtnCls =
  "flex w-full items-center justify-center rounded-md border border-input bg-background px-4 py-2.5 text-sm font-medium transition-colors hover:bg-accent";
