"use client";

import { cloneElement, isValidElement, useState, useEffect, useId, type ReactElement } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMe, useUpdateProfile, useRecordConsent } from "@/hooks/useMe";
import { ApiClientError } from "@/lib/api-client";
import { useLang } from "@/lib/language-context";
import { t } from "@/lib/i18n";
import type { Gender, JapaneseLevel, VisaStatus } from "@/types/api";

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

const step5BaseSchema = z.object({
  name_kana: z.string().min(1, "Furigana is required"),
  date_of_birth: z.string().min(1, "Date of birth is required"),
  gender: z.enum(["male", "female"] as const),
  phone_number: z.string().min(1, "Phone number is required"),
  mailing_address: z.string().min(1, "Mailing address is required"),
  residence_card_expiration: z.string().min(1, "Residence card expiration date is required"),
  visa_category: z.string().optional(),
});

type Step2Data = z.infer<typeof step2Schema>;
type Step3Data = z.infer<typeof step3Schema>;
type Step4Data = z.infer<typeof step4Schema>;
type Step5Data = z.infer<typeof step5BaseSchema>;

const TOTAL_STEPS = 5;

function errorMessage(err: unknown, lang: Parameters<typeof t>[2]): string {
  return err instanceof ApiClientError ? err.detail : t("common", "error", lang);
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function OnboardingPage() {
  const router = useRouter();
  const { data: me } = useMe();
  const updateProfile = useUpdateProfile();
  const recordConsent = useRecordConsent();
  const { lang } = useLang();
  const [step, setStep] = useState(1);
  const [error, setError] = useState<string | null>(null);

  // If already completed, redirect
  useEffect(() => {
    if (me?.profile?.onboarding_completed) {
      router.replace("/dashboard/resumes");
    }
  }, [me?.profile?.onboarding_completed, router]);

  const stepLabel = t("onboarding", "stepOf", lang)
    .replace("{n}", String(step))
    .replace("{t}", String(TOTAL_STEPS));

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-muted/40 p-4">
      <div className="w-full max-w-lg rounded-xl border bg-card p-8 shadow-sm">
        {/* Progress header */}
        <div className="mb-8">
          <p className="text-sm font-medium text-muted-foreground">{stepLabel}</p>
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
              } catch (err) {
                setError(errorMessage(err, lang));
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
                  full_name: data.full_name,
                  preferred_language: data.preferred_language,
                  onboarding_step: 1,
                });
                setStep(3);
              } catch (err) {
                setError(errorMessage(err, lang));
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
              } catch (err) {
                setError(errorMessage(err, lang));
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
                setStep(5);
              } catch (err) {
                setError(errorMessage(err, lang));
              }
            }}
            onBack={() => setStep(3)}
            loading={updateProfile.isPending}
          />
        )}

        {/* Step 5 — Personal info for 履歴書 */}
        {step === 5 && (
          <Step5
            visaHeld={me?.profile?.visa_status === "held"}
            onNext={async (data) => {
              setError(null);
              try {
                await updateProfile.mutateAsync({
                  name_kana: data.name_kana,
                  date_of_birth: data.date_of_birth,
                  gender: data.gender as Gender,
                  phone_number: data.phone_number,
                  mailing_address: data.mailing_address,
                  residence_card_expiration: data.residence_card_expiration,
                  ...(data.visa_category ? { visa_category: data.visa_category } : {}),
                  onboarding_step: 5,
                });
                router.push("/dashboard/resumes");
              } catch (err) {
                setError(errorMessage(err, lang));
              }
            }}
            onBack={() => setStep(4)}
            loading={updateProfile.isPending}
          />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 1 — AI processing consent
// ---------------------------------------------------------------------------

function Step1Consent({ onNext, loading }: { onNext: () => Promise<void>; loading: boolean }) {
  const { lang } = useLang();
  const [checked, setChecked] = useState(false);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("onboarding", "s1Title", lang)}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("onboarding", "s1Sub", lang)}</p>
      </div>

      <div className="space-y-2 rounded-lg border bg-muted/40 p-4 text-sm text-muted-foreground">
        <p>{t("onboarding", "s1Agree", lang)}</p>
        <ul className="ml-4 list-disc space-y-1">
          <li>{t("onboarding", "s1P1", lang)}</li>
          <li>{t("onboarding", "s1P2", lang)}</li>
          <li>{t("onboarding", "s1P3", lang)}</li>
        </ul>
        <p>
          {t("onboarding", "s1Withdraw", lang)}{" "}
          <span className="font-medium text-foreground">
            {t("onboarding", "s1DangerZone", lang)}
          </span>
          .
        </p>
      </div>

      <label className="flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => setChecked(e.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 accent-primary"
        />
        <span className="text-sm">{t("onboarding", "s1Checkbox", lang)}</span>
      </label>

      <button
        onClick={onNext}
        disabled={!checked || loading}
        className="flex w-full items-center justify-center rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {loading ? t("common", "saving", lang) : t("onboarding", "s1Btn", lang)}
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
  const { lang } = useLang();
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
      <h1 className="text-2xl font-semibold">{t("onboarding", "s2Title", lang)}</h1>
      <p className="text-sm text-muted-foreground">{t("onboarding", "s2Sub", lang)}</p>

      <Field label={t("onboarding", "s2Name", lang)} error={errors.full_name?.message}>
        <input {...register("full_name")} placeholder="Budi Santoso" className={inputCls} />
      </Field>

      <Field label={t("onboarding", "s2Lang", lang)} error={errors.preferred_language?.message}>
        <select {...register("preferred_language")} className={inputCls}>
          <option value="id">Indonesian (Bahasa Indonesia)</option>
          <option value="en">English</option>
          <option value="ja">Japanese (日本語)</option>
        </select>
      </Field>

      <div className="flex gap-3">
        <button type="button" onClick={onBack} className={secondaryBtnCls}>
          {t("common", "back", lang)}
        </button>
        <SubmitBtn loading={loading} label={t("common", "continue", lang)} />
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
  const { lang } = useLang();
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
      <h1 className="text-2xl font-semibold">{t("onboarding", "s3Title", lang)}</h1>
      <p className="text-sm text-muted-foreground">{t("onboarding", "s3Sub", lang)}</p>

      <Field label={t("onboarding", "s3Nation", lang)} error={errors.nationality?.message}>
        <input {...register("nationality")} placeholder="Indonesian" className={inputCls} />
      </Field>

      <Field label={t("onboarding", "s3CurrLoc", lang)} error={errors.current_location?.message}>
        <input
          {...register("current_location")}
          placeholder="Jakarta, Indonesia"
          className={inputCls}
        />
      </Field>

      <Field label={t("onboarding", "s3TargLoc", lang)} error={errors.target_location?.message}>
        <input {...register("target_location")} placeholder="Tokyo" className={inputCls} />
      </Field>

      <Field label={t("onboarding", "s3ExpYears", lang)} error={errors.years_experience?.message}>
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
          {t("common", "back", lang)}
        </button>
        <SubmitBtn loading={loading} label={t("common", "continue", lang)} />
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
  const { lang } = useLang();
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
      <h1 className="text-2xl font-semibold">{t("onboarding", "s4Title", lang)}</h1>
      <p className="text-sm text-muted-foreground">{t("onboarding", "s4Sub", lang)}</p>

      <Field label={t("onboarding", "s4JpLevel", lang)} error={errors.japanese_level?.message}>
        <select {...register("japanese_level")} className={inputCls}>
          <option value="none">{t("onboarding", "noJapanese", lang)}</option>
          <option value="N5">N5 — Basic</option>
          <option value="N4">N4 — Elementary</option>
          <option value="N3">N3 — Intermediate</option>
          <option value="N2">N2 — Upper-intermediate</option>
          <option value="N1">N1 — Advanced</option>
        </select>
      </Field>

      <Field label={t("onboarding", "s4Visa", lang)} error={errors.visa_status?.message}>
        <select {...register("visa_status")} className={inputCls}>
          <option value="none">{t("onboarding", "visaNone", lang)}</option>
          <option value="pending">{t("onboarding", "visaPending", lang)}</option>
          <option value="held">{t("onboarding", "visaHeld", lang)}</option>
        </select>
      </Field>

      <Field label={t("onboarding", "s4Industries", lang)} error={errors.target_industry?.message}>
        <input
          {...register("target_industry")}
          placeholder="IT, Manufacturing, Finance"
          className={inputCls}
        />
      </Field>

      <Field label={t("onboarding", "s4Roles", lang)} error={errors.target_role?.message}>
        <input
          {...register("target_role")}
          placeholder="Software Engineer, Project Manager"
          className={inputCls}
        />
      </Field>

      <div className="flex gap-3">
        <button type="button" onClick={onBack} className={secondaryBtnCls}>
          {t("common", "back", lang)}
        </button>
        <SubmitBtn loading={loading} label={t("common", "continue", lang)} />
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Step 5 — Personal info for 履歴書
// ---------------------------------------------------------------------------

function Step5({
  visaHeld,
  onNext,
  onBack,
  loading,
}: {
  visaHeld: boolean;
  onNext: (data: Step5Data) => Promise<void>;
  onBack: () => void;
  loading: boolean;
}) {
  const { lang } = useLang();
  const step5Schema = visaHeld
    ? step5BaseSchema.extend({
        visa_category: z.string().min(1, "Visa category is required"),
      })
    : step5BaseSchema;
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Step5Data>({
    resolver: zodResolver(step5Schema),
    defaultValues: { gender: "male" },
  });

  return (
    <form onSubmit={handleSubmit(onNext)} className="space-y-5">
      <h1 className="text-2xl font-semibold">{t("onboarding", "s5Title", lang)}</h1>
      <p className="text-sm text-muted-foreground">{t("onboarding", "s5Sub", lang)}</p>

      <p className="text-xs font-semibold uppercase text-muted-foreground">
        {t("onboarding", "s5GroupIdentity", lang)}
      </p>
      <Field label={t("onboarding", "s5NameKana", lang)} error={errors.name_kana?.message}>
        <input {...register("name_kana")} placeholder="ヤマダ タロウ" className={inputCls} />
      </Field>
      <Field label={t("onboarding", "s5DateOfBirth", lang)} error={errors.date_of_birth?.message}>
        <input {...register("date_of_birth")} type="date" className={inputCls} />
      </Field>
      <Field label={t("onboarding", "s5Gender", lang)} error={errors.gender?.message}>
        <select {...register("gender")} className={inputCls}>
          <option value="male">{t("onboarding", "s5GenderMale", lang)}</option>
          <option value="female">{t("onboarding", "s5GenderFemale", lang)}</option>
        </select>
      </Field>

      <p className="text-xs font-semibold uppercase text-muted-foreground">
        {t("onboarding", "s5GroupContact", lang)}
      </p>
      <Field label={t("onboarding", "s5Phone", lang)} error={errors.phone_number?.message}>
        <input {...register("phone_number")} type="tel" className={inputCls} />
      </Field>
      <Field label={t("onboarding", "s5Address", lang)} error={errors.mailing_address?.message}>
        <input {...register("mailing_address")} className={inputCls} />
      </Field>

      <p className="text-xs font-semibold uppercase text-muted-foreground">
        {t("onboarding", "s5GroupVisa", lang)}
      </p>
      <Field
        label={t("onboarding", "s5VisaExpiration", lang)}
        error={errors.residence_card_expiration?.message}
      >
        <input {...register("residence_card_expiration")} type="date" className={inputCls} />
      </Field>
      {visaHeld && (
        <Field
          label={t("onboarding", "s5VisaCategory", lang)}
          error={errors.visa_category?.message}
        >
          <input {...register("visa_category")} className={inputCls} />
        </Field>
      )}

      <div className="flex gap-3">
        <button type="button" onClick={onBack} className={secondaryBtnCls}>
          {t("common", "back", lang)}
        </button>
        <SubmitBtn loading={loading} label={t("onboarding", "completeBtn", lang)} />
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
  error?: string | undefined;
  children: React.ReactNode;
}) {
  const id = useId();
  const errorId = error ? `${id}-error` : undefined;
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-medium text-foreground">
        {label}
      </label>
      {isValidElement(children)
        ? cloneElement(
            children as ReactElement<{
              id?: string;
              "aria-describedby"?: string;
              "aria-invalid"?: boolean;
            }>,
            {
              id,
              "aria-invalid": Boolean(error),
              ...(errorId ? { "aria-describedby": errorId } : {}),
            },
          )
        : children}
      {error && (
        <p id={errorId} className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

function SubmitBtn({ label, loading }: { label: string; loading: boolean }) {
  const { lang } = useLang();
  return (
    <button
      type="submit"
      disabled={loading}
      className="flex w-full items-center justify-center rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
    >
      {loading ? t("common", "saving", lang) : label}
    </button>
  );
}

const inputCls =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2";

const secondaryBtnCls =
  "flex w-full items-center justify-center rounded-md border border-input bg-background px-4 py-2.5 text-sm font-medium transition-colors hover:bg-accent";
