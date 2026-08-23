"use client";

import { cloneElement, isValidElement, useEffect, useId, useState, type ReactElement } from "react";
import { useRouter } from "next/navigation";
import { useClerk } from "@clerk/nextjs";
import { z } from "zod";
import { useMe, useUpdateProfile } from "@/hooks/useMe";
import { useDeleteAccount } from "@/hooks/useAccount";
import { useLang } from "@/lib/language-context";
import { t } from "@/lib/i18n";
import { SIGN_IN_ROUTE } from "@/lib/routes";
import { PhotoUploader } from "@/components/profile/PhotoUploader";
import type {
  Gender,
  JapaneseLevel,
  PreferredLanguage,
  ProfileUpdateRequest,
  VisaStatus,
} from "@/types/api";

const profileFormSchema = z.object({
  years_experience: z.coerce
    .number()
    .min(0, "Must be 0 or greater")
    .max(80, "Must be 80 or less")
    .optional(),
});

type ProfileFieldErrors = Partial<
  Record<keyof z.infer<typeof profileFormSchema>, string | undefined>
>;

const JAPANESE_LEVELS: JapaneseLevel[] = ["N1", "N2", "N3", "N4", "N5", "none"];
const LANGUAGES: { value: PreferredLanguage; label: string }[] = [
  { value: "id", label: "Indonesian (Bahasa Indonesia)" },
  { value: "en", label: "English" },
  { value: "ja", label: "Japanese (日本語)" },
];

export default function SettingsPage() {
  const { lang } = useLang();
  return (
    <div className="mx-auto max-w-2xl space-y-10">
      <div>
        <h1 className="text-2xl font-semibold">{t("settings", "title", lang)}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("settings", "sub", lang)}</p>
      </div>

      <ProfileSection />
      <DangerZone />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Profile edit form
// ---------------------------------------------------------------------------

function ProfileSection() {
  const { data: me, isLoading } = useMe();
  const updateProfile = useUpdateProfile();
  const { lang } = useLang();

  const VISA_STATUSES: { value: VisaStatus; label: string }[] = [
    { value: "none", label: t("settings", "visaNone", lang) },
    { value: "pending", label: t("settings", "visaPending", lang) },
    { value: "held", label: t("settings", "visaHeld", lang) },
  ];

  const [form, setForm] = useState<ProfileUpdateRequest>({});
  const [saved, setSaved] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<ProfileFieldErrors>({});

  useEffect(() => {
    if (!me?.profile) return;
    const p = me.profile;
    const next = {
      full_name: me.user.full_name ?? undefined,
      nationality: p.nationality ?? undefined,
      japanese_level: p.japanese_level,
      visa_status: p.visa_status,
      preferred_language: p.preferred_language,
      years_experience: p.years_experience ?? undefined,
      target_role: p.target_role ?? [],
      target_industry: p.target_industry ?? [],
      name_kana: p.name_kana ?? undefined,
      date_of_birth: p.date_of_birth ?? undefined,
      gender: p.gender ?? undefined,
      phone_number: p.phone_number ?? undefined,
      mailing_address: p.mailing_address ?? undefined,
      residence_card_expiration: p.residence_card_expiration ?? undefined,
      visa_category: p.visa_category ?? undefined,
      hobbies: p.hobbies ?? undefined,
      special_skills: p.special_skills ?? undefined,
      personal_requests: p.personal_requests ?? "貴社の規定に従います。",
    };
    // Drop keys whose value is explicitly `undefined` before setForm: with
    // exactOptionalPropertyTypes, ProfileUpdateRequest accepts an omitted key
    // but not one present with value `undefined`, and nullable profile fields
    // coalesced via `?? undefined` above can produce those (see the same
    // pattern in app/onboarding/page.tsx's Step5 defaultValues).
    setForm(
      Object.fromEntries(
        Object.entries(next).filter(([, v]) => v !== undefined),
      ) as ProfileUpdateRequest,
    );
    // Depend on profile identity, not the `me` object reference: `me` changes
    // reference whenever any cached mutation touches it (e.g. PhotoUploader's
    // independent upload, or this form's own post-save cache update), and an
    // unconditional re-sync on every reference change would silently discard
    // unsaved edits to every other field. The profile's id only changes for a
    // genuinely different profile (e.g. a different signed-in user).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.profile?.id]);

  function handleChange<K extends keyof ProfileUpdateRequest>(
    key: K,
    value: ProfileUpdateRequest[K],
  ) {
    setSaved(false);
    if (key === "years_experience") setFieldErrors({ years_experience: undefined });
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const result = profileFormSchema.safeParse(form);
    if (!result.success) {
      const errors = result.error.flatten().fieldErrors;
      setFieldErrors({ years_experience: errors.years_experience?.[0] });
      setSaved(false);
      return;
    }
    setFieldErrors({});

    await updateProfile.mutateAsync(form);
    setSaved(true);
  }

  if (isLoading) return <SectionSkeleton />;

  return (
    <section className="space-y-6">
      <h2 className="text-base font-semibold">{t("settings", "profile", lang)}</h2>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="space-y-1">
          <h3 className="text-sm font-medium">{t("settings", "rirekishoInfo", lang)}</h3>
          <p className="text-xs text-muted-foreground">
            {t("settings", "rirekishoInfoHint", lang)}
          </p>
        </div>

        <Field label={t("settings", "fullName", lang)}>
          <input
            type="text"
            value={form.full_name ?? ""}
            onChange={(e) => handleChange("full_name", e.target.value || undefined)}
            className={inputCls}
          />
        </Field>

        <Field label={t("settings", "nameKana", lang)}>
          <input
            type="text"
            value={form.name_kana ?? ""}
            onChange={(e) => handleChange("name_kana", e.target.value || undefined)}
            placeholder="ヤマダ タロウ"
            className={inputCls}
          />
        </Field>

        <Field label={t("settings", "dateOfBirth", lang)}>
          <input
            type="date"
            value={form.date_of_birth ?? ""}
            onChange={(e) => handleChange("date_of_birth", e.target.value || undefined)}
            className={inputCls}
          />
        </Field>

        <Field label={t("settings", "gender", lang)}>
          <select
            value={form.gender ?? ""}
            onChange={(e) =>
              handleChange("gender", (e.target.value || undefined) as Gender | undefined)
            }
            className={inputCls}
          >
            <option value="" disabled>
              {t("settings", "genderSelect", lang)}
            </option>
            <option value="male">{t("settings", "genderMale", lang)}</option>
            <option value="female">{t("settings", "genderFemale", lang)}</option>
          </select>
        </Field>

        <Field label={t("settings", "phone", lang)}>
          <input
            type="tel"
            value={form.phone_number ?? ""}
            onChange={(e) => handleChange("phone_number", e.target.value || undefined)}
            className={inputCls}
          />
        </Field>

        <Field label={t("settings", "address", lang)}>
          <input
            type="text"
            value={form.mailing_address ?? ""}
            onChange={(e) => handleChange("mailing_address", e.target.value || undefined)}
            className={inputCls}
          />
        </Field>

        <Field label={t("settings", "visaExpiration", lang)}>
          <input
            type="date"
            value={form.residence_card_expiration ?? ""}
            onChange={(e) =>
              handleChange("residence_card_expiration", e.target.value || undefined)
            }
            className={inputCls}
          />
        </Field>

        <Field label={t("settings", "photo", lang)} hint={t("settings", "photoHint", lang)}>
          <PhotoUploader />
        </Field>

        <Field label={t("settings", "hobbies", lang)}>
          <input
            type="text"
            value={form.hobbies ?? ""}
            onChange={(e) => handleChange("hobbies", e.target.value || undefined)}
            className={inputCls}
          />
        </Field>

        <Field label={t("settings", "specialSkills", lang)}>
          <input
            type="text"
            value={form.special_skills ?? ""}
            onChange={(e) => handleChange("special_skills", e.target.value || undefined)}
            className={inputCls}
          />
        </Field>

        <Field
          label={t("settings", "personalRequests", lang)}
          hint={t("settings", "personalRequestsHint", lang)}
        >
          <input
            type="text"
            value={form.personal_requests ?? ""}
            onChange={(e) => handleChange("personal_requests", e.target.value || undefined)}
            className={inputCls}
          />
        </Field>

        <Field label={t("settings", "nationality", lang)}>
          <input
            type="text"
            value={form.nationality ?? ""}
            onChange={(e) => handleChange("nationality", e.target.value || undefined)}
            placeholder="e.g. Indonesian"
            className={inputCls}
          />
        </Field>

        <Field label={t("settings", "jpLevel", lang)}>
          <select
            value={form.japanese_level ?? "none"}
            onChange={(e) => handleChange("japanese_level", e.target.value as JapaneseLevel)}
            className={inputCls}
          >
            {JAPANESE_LEVELS.map((l) => (
              <option key={l} value={l}>
                {l === "none" ? t("settings", "jpNotTested", lang) : l}
              </option>
            ))}
          </select>
        </Field>

        <Field label={t("settings", "visaStatus", lang)}>
          <select
            value={form.visa_status ?? "none"}
            onChange={(e) => handleChange("visa_status", e.target.value as VisaStatus)}
            className={inputCls}
          >
            {VISA_STATUSES.map((v) => (
              <option key={v.value} value={v.value}>
                {v.label}
              </option>
            ))}
          </select>
        </Field>

        {form.visa_status === "held" && (
          <Field label={t("settings", "visaCategory", lang)}>
            <input
              type="text"
              value={form.visa_category ?? ""}
              onChange={(e) => handleChange("visa_category", e.target.value || undefined)}
              className={inputCls}
            />
          </Field>
        )}

        <Field label={t("settings", "yearsExp", lang)} error={fieldErrors.years_experience}>
          <input
            type="number"
            min={0}
            max={80}
            value={form.years_experience ?? ""}
            onChange={(e) =>
              handleChange(
                "years_experience",
                e.target.value === "" ? undefined : Number(e.target.value),
              )
            }
            placeholder="e.g. 3"
            className={inputCls}
          />
        </Field>

        <Field
          label={t("settings", "targetRoles", lang)}
          hint={t("settings", "targetRolesHint", lang)}
        >
          <input
            type="text"
            value={(form.target_role ?? []).join(", ")}
            onChange={(e) =>
              handleChange(
                "target_role",
                e.target.value
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean),
              )
            }
            placeholder="e.g. Software Engineer, Backend Developer"
            className={inputCls}
          />
        </Field>

        <Field
          label={t("settings", "targetIndustries", lang)}
          hint={t("settings", "targetIndustriesHint", lang)}
        >
          <input
            type="text"
            value={(form.target_industry ?? []).join(", ")}
            onChange={(e) =>
              handleChange(
                "target_industry",
                e.target.value
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean),
              )
            }
            placeholder="e.g. Technology, Finance"
            className={inputCls}
          />
        </Field>

        <Field label={t("settings", "preferredLang", lang)}>
          <select
            value={form.preferred_language ?? "id"}
            onChange={(e) =>
              handleChange("preferred_language", e.target.value as PreferredLanguage)
            }
            className={inputCls}
          >
            {LANGUAGES.map((l) => (
              <option key={l.value} value={l.value}>
                {l.label}
              </option>
            ))}
          </select>
        </Field>

        {updateProfile.error && (
          <p className="text-sm text-destructive">
            {(updateProfile.error as { detail?: string }).detail ?? t("settings", "saveFail", lang)}
          </p>
        )}

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={updateProfile.isPending}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {updateProfile.isPending
              ? t("common", "saving", lang)
              : t("common", "saveChanges", lang)}
          </button>
          {saved && !updateProfile.isPending && (
            <p className="text-sm text-green-600">{t("common", "saved", lang)}</p>
          )}
        </div>
      </form>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Danger zone — account deletion
// ---------------------------------------------------------------------------

function DangerZone() {
  const router = useRouter();
  const { signOut } = useClerk();
  const deleteAccount = useDeleteAccount();
  const { lang } = useLang();
  const [showConfirm, setShowConfirm] = useState(false);
  const [confirmText, setConfirmText] = useState("");

  const CONFIRM_PHRASE = t("settings", "confirmPhrase", lang);
  const ready = confirmText.toLowerCase() === CONFIRM_PHRASE.toLowerCase();

  async function handleDelete() {
    if (!ready) return;
    await deleteAccount.mutateAsync();
    await signOut();
    router.push(SIGN_IN_ROUTE);
  }

  return (
    <section className="space-y-4">
      <h2 className="text-base font-semibold text-destructive">
        {t("settings", "dangerZone", lang)}
      </h2>

      <div className="space-y-4 rounded-lg border border-destructive/40 bg-destructive/5 p-5">
        <div>
          <p className="text-sm font-medium">{t("settings", "deleteAccount", lang)}</p>
          <p className="mt-1 text-sm text-muted-foreground">{t("settings", "deleteDesc", lang)}</p>
        </div>

        {!showConfirm ? (
          <button
            onClick={() => setShowConfirm(true)}
            className="rounded-md border border-destructive px-3 py-1.5 text-sm text-destructive hover:bg-destructive/10"
          >
            {t("settings", "deleteBtn", lang)}
          </button>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {t("settings", "typeToConfirm", lang)}{" "}
              <span className="font-mono font-medium text-foreground">{CONFIRM_PHRASE}</span>{" "}
              {t("settings", "toConfirm", lang)}
            </p>
            <input
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={CONFIRM_PHRASE}
              className={`${inputCls} font-mono`}
              autoFocus
            />

            {deleteAccount.error && (
              <p className="text-sm text-destructive">
                {(deleteAccount.error as { detail?: string }).detail ??
                  t("settings", "deleteFail", lang)}
              </p>
            )}

            <div className="flex gap-3">
              <button
                onClick={handleDelete}
                disabled={!ready || deleteAccount.isPending}
                className="rounded-md bg-destructive px-3 py-1.5 text-sm font-medium text-destructive-foreground hover:opacity-90 disabled:opacity-40"
              >
                {deleteAccount.isPending
                  ? t("settings", "deleting", lang)
                  : t("settings", "confirmDeletion", lang)}
              </button>
              <button
                onClick={() => {
                  setShowConfirm(false);
                  setConfirmText("");
                }}
                className="rounded-md border px-3 py-1.5 text-sm hover:bg-accent"
              >
                {t("common", "cancel", lang)}
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Shared
// ---------------------------------------------------------------------------

function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string | undefined;
  children: React.ReactNode;
}) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      {hint && (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
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
              ...(describedBy ? { "aria-describedby": describedBy } : {}),
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

const inputCls =
  "w-full rounded-md border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary";

function SectionSkeleton() {
  return (
    <div className="space-y-4">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="space-y-1.5">
          <div className="h-3 w-32 animate-pulse rounded bg-muted" />
          <div className="h-9 animate-pulse rounded-md bg-muted" />
        </div>
      ))}
    </div>
  );
}
