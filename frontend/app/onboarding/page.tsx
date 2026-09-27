"use client";

import { useState, useEffect, useRef, type Ref } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMe, useUpdateProfile, useRecordConsent } from "@/hooks/useMe";
import { apiErrorMessage } from "@/lib/api-error";
import { useLang } from "@/lib/language-context";
import { LANGUAGES, t, type Language } from "@/lib/i18n";
import { PhotoUploader } from "@/components/profile/PhotoUploader";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Select } from "@/components/ui/select";
import { TagInput } from "@/components/ui/tag-input";
import type { Gender, JapaneseLevel, VisaStatus } from "@/types/api";

// ---------------------------------------------------------------------------
// Step schemas
// ---------------------------------------------------------------------------

const step2Schema = z.object({
  full_name: z.string().min(1, "Name is required"),
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
  target_industry: z.array(z.string()).min(1, "Enter at least one industry"),
  target_role: z.array(z.string()).min(1, "Enter at least one role"),
});

const step5BaseSchema = z.object({
  name_kana: z.string().min(1, "Furigana is required"),
  date_of_birth: z.string().min(1, "Date of birth is required"),
  gender: z.enum(["male", "female"] as const),
  phone_number: z.string().min(1, "Phone number is required"),
  mailing_address: z.string().min(1, "Mailing address is required"),
  residence_card_expiration: z.string().min(1, "Residence card expiration date is required"),
  visa_category: z.string().optional(),
  hobbies: z.string().optional(),
  special_skills: z.string().optional(),
  personal_requests: z.string().optional(),
});

type Step2Data = z.infer<typeof step2Schema>;
type Step3Data = z.infer<typeof step3Schema>;
type Step4Data = z.infer<typeof step4Schema>;
type Step5Data = z.infer<typeof step5BaseSchema>;

const TOTAL_STEPS = 5;

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
  const didSyncStep = useRef(false);
  // Each step's first control is the same element to React, so after
  // Continue the keyboard focus would sit on the next step's Back button.
  // Move it to the new step's title instead (not on first render).
  const titleRef = useRef<HTMLHeadingElement>(null);
  const firstStep = useRef(true);
  useEffect(() => {
    if (firstStep.current) {
      firstStep.current = false;
      return;
    }
    titleRef.current?.focus();
  }, [step]);

  // If already completed, redirect
  useEffect(() => {
    if (me?.profile?.onboarding_completed) {
      router.replace("/dashboard");
    }
  }, [me?.profile?.onboarding_completed, router]);

  // Resume at the step after the last one saved, so a returning user isn't
  // forced to re-walk the whole wizard. Runs once: after this, the user's own
  // Back/Continue navigation owns `step`, and re-syncing would fight it.
  //
  // Exception: step 2 is the only place full_name is captured, so a user
  // missing it starts there however far they previously got. Without this they
  // would jump to step 5, finish it, flip the onboarding_completed generated
  // column, and then be redirected away permanently by the guard above — with
  // full_name still unset, leaving 履歴書 generation blocked and no route back.
  useEffect(() => {
    if (didSyncStep.current || !me) return;
    didSyncStep.current = true;

    const saved = me.profile?.onboarding_step ?? 0;
    // onboarding_step values don't advance 1:1 with wizard step numbers: step 3
    // saves onboarding_step 2 (not 3), and step 4 saves 4, skipping 3 entirely.
    // This maps "last value saved" to the step that comes right after it.
    let next: number;
    if (saved >= 4) next = 5;
    else if (saved >= 2) next = 4;
    else if (saved >= 1) next = 3;
    else next = 1;

    const target = me.user.full_name ? next : Math.min(next, 2);
    // Functional update: if the user has already navigated away from the
    // initial step (e.g. finished step 1's consent while `me` was still
    // resolving), this sync must not clobber that — only apply when we're
    // still sitting at the untouched default.
    setStep((current) => (current === 1 ? target : current));
  }, [me]);

  const stepLabel = t("onboarding", "stepOf", lang)
    .replace("{n}", String(step))
    .replace("{t}", String(TOTAL_STEPS));

  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="flex min-h-screen flex-col items-center justify-center bg-muted/40 p-4 focus:outline-none"
    >
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

        {error && <Alert className="mb-4">{error}</Alert>}

        {/* Step 1 — Consent */}
        {step === 1 && (
          <Step1Consent
            titleRef={titleRef}
            onNext={async () => {
              setError(null);
              try {
                await recordConsent.mutateAsync();
                setStep(2);
              } catch (err) {
                setError(apiErrorMessage(err, lang));
              }
            }}
            loading={recordConsent.isPending}
          />
        )}

        {/* Step 2 — Name + language */}
        {step === 2 && (
          <Step2
            titleRef={titleRef}
            onNext={async (data) => {
              setError(null);
              try {
                await updateProfile.mutateAsync({
                  full_name: data.full_name,
                  preferred_language: lang,
                  onboarding_step: 1,
                });
                setStep(3);
              } catch (err) {
                setError(apiErrorMessage(err, lang));
              }
            }}
            onBack={() => setStep(1)}
            loading={updateProfile.isPending}
          />
        )}

        {/* Step 3 — Location + experience */}
        {step === 3 && (
          <Step3
            titleRef={titleRef}
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
                setError(apiErrorMessage(err, lang));
              }
            }}
            onBack={() => setStep(2)}
            loading={updateProfile.isPending}
          />
        )}

        {/* Step 4 — Japanese level + preferences */}
        {step === 4 && (
          <Step4
            titleRef={titleRef}
            onNext={async (data) => {
              setError(null);
              try {
                await updateProfile.mutateAsync({
                  japanese_level: data.japanese_level as JapaneseLevel,
                  visa_status: data.visa_status as VisaStatus,
                  target_industry: data.target_industry,
                  target_role: data.target_role,
                  onboarding_step: 4,
                });
                setStep(5);
              } catch (err) {
                setError(apiErrorMessage(err, lang));
              }
            }}
            onBack={() => setStep(3)}
            loading={updateProfile.isPending}
          />
        )}

        {/* Step 5 — Personal info for 履歴書 */}
        {step === 5 && (
          <Step5
            titleRef={titleRef}
            visaHeld={me?.profile?.visa_status === "held"}
            defaults={{
              name_kana: me?.profile?.name_kana ?? undefined,
              date_of_birth: me?.profile?.date_of_birth ?? undefined,
              gender: me?.profile?.gender ?? undefined,
              phone_number: me?.profile?.phone_number ?? undefined,
              mailing_address: me?.profile?.mailing_address ?? undefined,
              residence_card_expiration: me?.profile?.residence_card_expiration ?? undefined,
              visa_category: me?.profile?.visa_category ?? undefined,
              hobbies: me?.profile?.hobbies ?? undefined,
              special_skills: me?.profile?.special_skills ?? undefined,
              personal_requests: me?.profile?.personal_requests ?? "貴社の規定に従います。",
            }}
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
                  ...(data.hobbies ? { hobbies: data.hobbies } : {}),
                  ...(data.special_skills ? { special_skills: data.special_skills } : {}),
                  ...(data.personal_requests ? { personal_requests: data.personal_requests } : {}),
                  onboarding_step: 5,
                });
                router.push("/dashboard");
              } catch (err) {
                setError(apiErrorMessage(err, lang));
              }
            }}
            onBack={() => setStep(4)}
            loading={updateProfile.isPending}
          />
        )}
      </div>
    </main>
  );
}

// ---------------------------------------------------------------------------
// Step 1 — AI processing consent
// ---------------------------------------------------------------------------

function Step1Consent({
  titleRef,
  onNext,
  loading,
}: {
  titleRef: Ref<HTMLHeadingElement>;
  onNext: () => Promise<void>;
  loading: boolean;
}) {
  const { lang } = useLang();
  const [checked, setChecked] = useState(false);

  return (
    <div className="space-y-6">
      <PageHeader
        className="mb-0"
        titleRef={titleRef}
        title={t("onboarding", "s1Title", lang)}
        description={t("onboarding", "s1Sub", lang)}
      />

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
        <Checkbox
          checked={checked}
          onChange={(e) => setChecked(e.target.checked)}
          className="mt-0.5"
        />
        <span className="text-sm">{t("onboarding", "s1Checkbox", lang)}</span>
      </label>

      <Button
        className="w-full"
        onClick={() => void onNext()}
        disabled={!checked}
        loading={loading}
      >
        {loading ? t("common", "saving", lang) : t("onboarding", "s1Btn", lang)}
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 2 — Name + language
// ---------------------------------------------------------------------------

function Step2({
  titleRef,
  onNext,
  onBack,
  loading,
}: {
  titleRef: Ref<HTMLHeadingElement>;
  onNext: (data: Step2Data) => Promise<void>;
  onBack: () => void;
  loading: boolean;
}) {
  const { lang, setLang } = useLang();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Step2Data>({ resolver: zodResolver(step2Schema) });

  return (
    <form onSubmit={handleSubmit(onNext)} className="space-y-5">
      <PageHeader
        className="mb-0"
        titleRef={titleRef}
        title={t("onboarding", "s2Title", lang)}
        description={t("onboarding", "s2Sub", lang)}
      />

      <Field label={t("onboarding", "s2Name", lang)} error={errors.full_name?.message}>
        <Input {...register("full_name")} placeholder="Budi Santoso" />
      </Field>

      <div className="space-y-1.5">
        {/* The app's own language, as in Settings: it switches at once. */}
        <SegmentedControl<Language>
          legend={t("onboarding", "s2AppLang", lang)}
          name="app_language"
          value={lang}
          onChange={setLang}
          options={LANGUAGES.map(({ code, name }) => ({ value: code, label: name, lang: code }))}
        />
        <p className="text-xs text-muted-foreground">{t("onboarding", "s2AppLangHint", lang)}</p>
      </div>

      <StepButtons onBack={onBack} loading={loading} label={t("common", "continue", lang)} />
    </form>
  );
}

// ---------------------------------------------------------------------------
// Step 3 — Location + experience
// ---------------------------------------------------------------------------

function Step3({
  titleRef,
  onNext,
  onBack,
  loading,
}: {
  titleRef: Ref<HTMLHeadingElement>;
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
      <PageHeader
        className="mb-0"
        titleRef={titleRef}
        title={t("onboarding", "s3Title", lang)}
        description={t("onboarding", "s3Sub", lang)}
      />

      <Field label={t("onboarding", "s3Nation", lang)} error={errors.nationality?.message}>
        <Input {...register("nationality")} placeholder="Indonesian" />
      </Field>

      <Field label={t("onboarding", "s3CurrLoc", lang)} error={errors.current_location?.message}>
        <Input {...register("current_location")} placeholder="Jakarta, Indonesia" />
      </Field>

      <Field label={t("onboarding", "s3TargLoc", lang)} error={errors.target_location?.message}>
        <Input {...register("target_location")} placeholder="Tokyo" />
      </Field>

      <Field label={t("onboarding", "s3ExpYears", lang)} error={errors.years_experience?.message}>
        <Input {...register("years_experience")} type="number" min={0} max={80} />
      </Field>

      <StepButtons onBack={onBack} loading={loading} label={t("common", "continue", lang)} />
    </form>
  );
}

// ---------------------------------------------------------------------------
// Step 4 — Japanese level + job preferences
// ---------------------------------------------------------------------------

function Step4({
  titleRef,
  onNext,
  onBack,
  loading,
}: {
  titleRef: Ref<HTMLHeadingElement>;
  onNext: (data: Step4Data) => Promise<void>;
  onBack: () => void;
  loading: boolean;
}) {
  const { lang } = useLang();
  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<Step4Data>({
    resolver: zodResolver(step4Schema),
    defaultValues: {
      japanese_level: "none",
      visa_status: "none",
      target_industry: [],
      target_role: [],
    },
  });

  return (
    <form onSubmit={handleSubmit(onNext)} className="space-y-5">
      <PageHeader
        className="mb-0"
        titleRef={titleRef}
        title={t("onboarding", "s4Title", lang)}
        description={t("onboarding", "s4Sub", lang)}
      />

      <Field label={t("onboarding", "s4JpLevel", lang)} error={errors.japanese_level?.message}>
        <Select {...register("japanese_level")}>
          <option value="none">{t("onboarding", "noJapanese", lang)}</option>
          <option value="N5">N5 — Basic</option>
          <option value="N4">N4 — Elementary</option>
          <option value="N3">N3 — Intermediate</option>
          <option value="N2">N2 — Upper-intermediate</option>
          <option value="N1">N1 — Advanced</option>
        </Select>
      </Field>

      <Field label={t("onboarding", "s4Visa", lang)} error={errors.visa_status?.message}>
        <Select {...register("visa_status")}>
          <option value="none">{t("onboarding", "visaNone", lang)}</option>
          <option value="pending">{t("onboarding", "visaPending", lang)}</option>
          <option value="held">{t("onboarding", "visaHeld", lang)}</option>
        </Select>
      </Field>

      <Controller
        control={control}
        name="target_industry"
        render={({ field }) => (
          <Field
            label={t("onboarding", "s4Industries", lang)}
            error={errors.target_industry?.message}
          >
            <TagInput
              value={field.value}
              onChange={field.onChange}
              placeholder={t("settings", "addIndustry", lang)}
              removeLabel={t("settings", "removeTag", lang)}
            />
          </Field>
        )}
      />

      <Controller
        control={control}
        name="target_role"
        render={({ field }) => (
          <Field label={t("onboarding", "s4Roles", lang)} error={errors.target_role?.message}>
            <TagInput
              value={field.value}
              onChange={field.onChange}
              placeholder={t("settings", "addRole", lang)}
              removeLabel={t("settings", "removeTag", lang)}
            />
          </Field>
        )}
      />

      <StepButtons onBack={onBack} loading={loading} label={t("common", "continue", lang)} />
    </form>
  );
}

// ---------------------------------------------------------------------------
// Step 5 — Personal info for 履歴書
// ---------------------------------------------------------------------------

function Step5({
  titleRef,
  visaHeld,
  defaults,
  onNext,
  onBack,
  loading,
}: {
  titleRef: Ref<HTMLHeadingElement>;
  visaHeld: boolean;
  // Not Partial<Step5Data>: with exactOptionalPropertyTypes, an optional key
  // from Partial<T> still requires T when present, so a caller that supplies
  // `undefined` explicitly (as the page does, via `me?.profile?.x ?? undefined`)
  // would fail to type-check. This mapped type allows the value itself to be
  // undefined, not just the key to be omitted.
  defaults: { [K in keyof Step5Data]?: Step5Data[K] | undefined };
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
    // Drop keys whose value is explicitly undefined first: with
    // exactOptionalPropertyTypes, react-hook-form's defaultValues type accepts
    // an omitted key but not one present with value `undefined`, and `defaults`
    // (built from nullable profile fields via `?? undefined`) can contain those.
    // Spread first, then fall back for gender specifically: a plain spread of
    // an absent value would overwrite the fallback with undefined and leave
    // the radio group unset.
    defaultValues: {
      ...(Object.fromEntries(
        Object.entries(defaults).filter(([, v]) => v !== undefined),
      ) as Partial<Step5Data>),
      gender: defaults.gender ?? "male",
    },
  });

  return (
    <form onSubmit={handleSubmit(onNext)} className="space-y-5">
      <PageHeader
        className="mb-0"
        titleRef={titleRef}
        title={t("onboarding", "s5Title", lang)}
        description={t("onboarding", "s5Sub", lang)}
      />

      <p className="text-xs font-semibold uppercase text-muted-foreground">
        {t("onboarding", "s5GroupIdentity", lang)}
      </p>
      <Field label={t("onboarding", "s5NameKana", lang)} error={errors.name_kana?.message}>
        <Input {...register("name_kana")} lang="ja" placeholder="ヤマダ タロウ" />
      </Field>
      <Field label={t("onboarding", "s5DateOfBirth", lang)} error={errors.date_of_birth?.message}>
        <Input {...register("date_of_birth")} type="date" />
      </Field>
      <Field label={t("onboarding", "s5Gender", lang)} error={errors.gender?.message}>
        <Select {...register("gender")}>
          <option value="male">{t("onboarding", "s5GenderMale", lang)}</option>
          <option value="female">{t("onboarding", "s5GenderFemale", lang)}</option>
        </Select>
      </Field>

      <p className="text-xs font-semibold uppercase text-muted-foreground">
        {t("onboarding", "s5GroupContact", lang)}
      </p>
      <Field label={t("onboarding", "s5Phone", lang)} error={errors.phone_number?.message}>
        <Input {...register("phone_number")} type="tel" />
      </Field>
      <Field label={t("onboarding", "s5Address", lang)} error={errors.mailing_address?.message}>
        <Input {...register("mailing_address")} />
      </Field>

      <p className="text-xs font-semibold uppercase text-muted-foreground">
        {t("onboarding", "s5GroupVisa", lang)}
      </p>
      <Field
        label={t("onboarding", "s5VisaExpiration", lang)}
        error={errors.residence_card_expiration?.message}
      >
        <Input {...register("residence_card_expiration")} type="date" />
      </Field>
      {visaHeld && (
        <Field
          label={t("onboarding", "s5VisaCategory", lang)}
          error={errors.visa_category?.message}
        >
          <Input {...register("visa_category")} />
        </Field>
      )}

      <p className="text-xs font-semibold uppercase text-muted-foreground">
        {t("onboarding", "s5GroupExtras", lang)}
      </p>
      {/* Not a Field: PhotoUploader takes no id for a label to point at. */}
      <div className="space-y-1.5">
        <p className="text-sm font-medium">{t("onboarding", "s5Photo", lang)}</p>
        <PhotoUploader />
        <p className="text-xs text-muted-foreground">{t("onboarding", "s5PhotoHint", lang)}</p>
      </div>
      <Field label={t("onboarding", "s5Hobbies", lang)}>
        <Input {...register("hobbies")} />
      </Field>
      <Field label={t("onboarding", "s5SpecialSkills", lang)}>
        <Input {...register("special_skills")} />
      </Field>
      <Field
        label={t("onboarding", "s5PersonalRequests", lang)}
        hint={t("onboarding", "s5PersonalRequestsHint", lang)}
      >
        <Input {...register("personal_requests")} />
      </Field>

      <StepButtons onBack={onBack} loading={loading} label={t("onboarding", "completeBtn", lang)} />
    </form>
  );
}

// ---------------------------------------------------------------------------
// Shared UI
// ---------------------------------------------------------------------------

function StepButtons({
  onBack,
  loading,
  label,
}: {
  onBack: () => void;
  loading: boolean;
  label: string;
}) {
  const { lang } = useLang();
  return (
    <div className="flex gap-3">
      <Button type="button" variant="secondary" className="w-full" onClick={onBack}>
        {t("common", "back", lang)}
      </Button>
      <Button type="submit" className="w-full" loading={loading}>
        {loading ? t("common", "saving", lang) : label}
      </Button>
    </div>
  );
}
