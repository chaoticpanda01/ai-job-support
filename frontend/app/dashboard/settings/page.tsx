"use client";

import { cloneElement, isValidElement, useEffect, useId, useState, type ReactElement } from "react";
import { useRouter } from "next/navigation";
import { useClerk } from "@clerk/nextjs";
import { z } from "zod";
import { useMe, useUpdateProfile } from "@/hooks/useMe";
import { useDeleteAccount } from "@/hooks/useAccount";
import { useLang } from "@/lib/language-context";
import { t, type Language } from "@/lib/i18n";
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

// Keys mirror rirekisho_missing_fields()'s "key" values in
// backend/app/services/rirekisho_completeness.py — kept in sync manually,
// see the comment on computeMissingRirekishoFields below.
const REQUIRED_FIELD_LABEL_KEYS: Record<string, string> = {
  full_name: "fullName",
  name_kana: "nameKana",
  date_of_birth: "dateOfBirth",
  gender: "gender",
  phone_number: "phone",
  mailing_address: "address",
  visa_category: "visaCategory",
  residence_card_expiration: "visaExpiration",
};

function missingFieldLabel(key: string, lang: Language): string {
  return t("settings", REQUIRED_FIELD_LABEL_KEYS[key] ?? key, lang);
}

/**
 * Deliberate, bounded duplication of a subset of
 * rirekisho_missing_fields() (backend/app/services/rirekisho_completeness.py):
 * simple presence checks, the date-of-birth age-range rule, and the
 * visa-held conditional. Needed so the Settings banner can update as the
 * user types, without a network round-trip per keystroke. If the backend's
 * required-field set changes, this must be updated too — everywhere else
 * (the rirekisho generation wizard) reads the backend's computed answer
 * directly with no duplication at all.
 */
function computeMissingRirekishoFields(
  form: ProfileUpdateRequest,
  visaStatus: VisaStatus | undefined,
): string[] {
  const missing: string[] = [];

  if (!form.full_name) missing.push("full_name");
  if (!form.name_kana) missing.push("name_kana");

  if (!form.date_of_birth) {
    missing.push("date_of_birth");
  } else {
    const dob = new Date(form.date_of_birth);
    const today = new Date();
    let age = today.getFullYear() - dob.getFullYear();
    const hadBirthdayThisYear =
      today.getMonth() > dob.getMonth() ||
      (today.getMonth() === dob.getMonth() && today.getDate() >= dob.getDate());
    if (!hadBirthdayThisYear) age -= 1;
    if (age < 16 || age > 80) missing.push("date_of_birth");
  }

  if (!form.gender) missing.push("gender");
  if (!form.phone_number) missing.push("phone_number");
  if (!form.mailing_address) missing.push("mailing_address");

  if (visaStatus === "held") {
    if (!form.visa_category) missing.push("visa_category");
    if (!form.residence_card_expiration) missing.push("residence_card_expiration");
  }

  return missing;
}

function focusField(key: string) {
  const el = document.getElementById(`rirekisho-field-${key}`);
  if (el) {
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.focus({ preventScroll: true });
  }
}

function RirekishoCompletenessBanner({
  missingKeys,
  totalRequired,
}: {
  missingKeys: string[];
  totalRequired: number;
}) {
  const { lang } = useLang();

  if (missingKeys.length === 0) {
    return (
      <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700 dark:bg-green-950 dark:text-green-400">
        {t("settings", "rirekishoReady", lang)}
      </p>
    );
  }

  return (
    <div className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-300">
      <p>
        {t("settings", "rirekishoMissingCount", lang)
          .replace("{n}", String(missingKeys.length))
          .replace("{m}", String(totalRequired))}
      </p>
      <p className="mt-1 space-x-1">
        {missingKeys.map((key, i) => (
          <span key={key}>
            <button
              type="button"
              onClick={() => focusField(key)}
              className="underline hover:no-underline"
            >
              {missingFieldLabel(key, lang)}
            </button>
            {i < missingKeys.length - 1 ? "," : ""}
          </span>
        ))}
      </p>
    </div>
  );
}

export default function SettingsPage() {
  const { lang } = useLang();
  return (
    <div className="mx-auto max-w-2xl space-y-10">
      <div>
        <h1 className="text-2xl font-semibold">{t("settings", "title", lang)}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("settings", "sub", lang)}</p>
      </div>

      <RirekishoInfoSection />
      <JobPreferencesSection />
      <DangerZone />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Rirekisho info — required-for-generation fields, saved independently
// ---------------------------------------------------------------------------

function RirekishoInfoSection() {
  const { data: me, isLoading } = useMe();
  const updateProfile = useUpdateProfile();
  const { lang } = useLang();

  const [form, setForm] = useState<ProfileUpdateRequest>({});
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!me?.profile) return;
    const p = me.profile;
    const next = {
      full_name: me.user.full_name ?? undefined,
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
    setForm(
      Object.fromEntries(
        Object.entries(next).filter(([, v]) => v !== undefined),
      ) as ProfileUpdateRequest,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.profile?.id]);

  function handleChange<K extends keyof ProfileUpdateRequest>(
    key: K,
    value: ProfileUpdateRequest[K],
  ) {
    setSaved(false);
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await updateProfile.mutateAsync(form);
    setSaved(true);
  }

  if (isLoading) return <SectionSkeleton />;

  // visa_status is edited in JobPreferencesSection, not here — this reads
  // the last-saved value (both sections share the ["me"] query cache), so
  // the visa-conditional fields below only react after that section is
  // saved, not on every keystroke there. See the module comment above
  // computeMissingRirekishoFields.
  const visaStatus = me?.profile?.visa_status;
  const missingKeys = computeMissingRirekishoFields(form, visaStatus);
  const totalRequired = visaStatus === "held" ? 8 : 6;
  const requiredBadge = t("settings", "required", lang);

  return (
    <section className="space-y-6" id="rirekisho-info">
      <div className="space-y-1">
        <h2 className="text-base font-semibold">{t("settings", "rirekishoInfo", lang)}</h2>
        <p className="text-xs text-muted-foreground">{t("settings", "rirekishoInfoHint", lang)}</p>
      </div>

      <RirekishoCompletenessBanner missingKeys={missingKeys} totalRequired={totalRequired} />

      <form onSubmit={handleSubmit} className="space-y-5">
        <Field
          id="rirekisho-field-full_name"
          label={t("settings", "fullName", lang)}
          badge={requiredBadge}
        >
          <input
            type="text"
            value={form.full_name ?? ""}
            onChange={(e) => handleChange("full_name", e.target.value || undefined)}
            className={inputCls}
          />
        </Field>

        <Field
          id="rirekisho-field-name_kana"
          label={t("settings", "nameKana", lang)}
          badge={requiredBadge}
        >
          <input
            type="text"
            value={form.name_kana ?? ""}
            onChange={(e) => handleChange("name_kana", e.target.value || undefined)}
            placeholder="ヤマダ タロウ"
            className={inputCls}
          />
        </Field>

        <Field
          id="rirekisho-field-date_of_birth"
          label={t("settings", "dateOfBirth", lang)}
          badge={requiredBadge}
        >
          <input
            type="date"
            value={form.date_of_birth ?? ""}
            onChange={(e) => handleChange("date_of_birth", e.target.value || undefined)}
            className={inputCls}
          />
        </Field>

        <Field
          id="rirekisho-field-gender"
          label={t("settings", "gender", lang)}
          badge={requiredBadge}
        >
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

        <Field
          id="rirekisho-field-phone_number"
          label={t("settings", "phone", lang)}
          badge={requiredBadge}
        >
          <input
            type="tel"
            value={form.phone_number ?? ""}
            onChange={(e) => handleChange("phone_number", e.target.value || undefined)}
            className={inputCls}
          />
        </Field>

        <Field
          id="rirekisho-field-mailing_address"
          label={t("settings", "address", lang)}
          badge={requiredBadge}
        >
          <input
            type="text"
            value={form.mailing_address ?? ""}
            onChange={(e) => handleChange("mailing_address", e.target.value || undefined)}
            className={inputCls}
          />
        </Field>

        <Field
          id="rirekisho-field-residence_card_expiration"
          label={t("settings", "visaExpiration", lang)}
          badge={visaStatus === "held" ? requiredBadge : undefined}
        >
          <input
            type="date"
            value={form.residence_card_expiration ?? ""}
            onChange={(e) => handleChange("residence_card_expiration", e.target.value || undefined)}
            className={inputCls}
          />
        </Field>

        {visaStatus === "held" && (
          <Field
            id="rirekisho-field-visa_category"
            label={t("settings", "visaCategory", lang)}
            badge={requiredBadge}
          >
            <input
              type="text"
              value={form.visa_category ?? ""}
              onChange={(e) => handleChange("visa_category", e.target.value || undefined)}
              className={inputCls}
            />
          </Field>
        )}

        <Field
          label={t("settings", "photo", lang)}
          hint={t("settings", "photoHint", lang)}
          badge={t("settings", "recommended", lang)}
        >
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
// Job preferences — used for AI prompt enrichment, never required
// ---------------------------------------------------------------------------

function JobPreferencesSection() {
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
      nationality: p.nationality ?? undefined,
      japanese_level: p.japanese_level,
      visa_status: p.visa_status,
      preferred_language: p.preferred_language,
      years_experience: p.years_experience ?? undefined,
      target_role: p.target_role ?? [],
      target_industry: p.target_industry ?? [],
    };
    setForm(
      Object.fromEntries(
        Object.entries(next).filter(([, v]) => v !== undefined),
      ) as ProfileUpdateRequest,
    );
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
      <div className="space-y-1">
        <h2 className="text-base font-semibold">{t("settings", "jobPreferences", lang)}</h2>
        <p className="text-xs text-muted-foreground">{t("settings", "jobPreferencesHint", lang)}</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
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
  id: idProp,
  label,
  hint,
  error,
  badge,
  children,
}: {
  id?: string;
  label: string;
  hint?: string;
  error?: string | undefined;
  badge?: string | undefined;
  children: React.ReactNode;
}) {
  const generatedId = useId();
  const id = idProp ?? generatedId;
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="flex items-center gap-2 text-sm font-medium">
        {label}
        {badge && (
          <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            {badge}
          </span>
        )}
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
