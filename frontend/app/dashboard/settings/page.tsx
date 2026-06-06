"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useClerk } from "@clerk/nextjs";
import { useMe, useUpdateProfile } from "@/hooks/useMe";
import { useDeleteAccount } from "@/hooks/useBilling";
import type {
  JapaneseLevel,
  PreferredLanguage,
  ProfileUpdateRequest,
  VisaStatus,
} from "@/types/api";

const JAPANESE_LEVELS: JapaneseLevel[] = ["N1", "N2", "N3", "N4", "N5", "none"];
const VISA_STATUSES: { value: VisaStatus; label: string }[] = [
  { value: "none",    label: "No visa / not yet applied" },
  { value: "pending", label: "Application pending" },
  { value: "held",    label: "Currently held" },
];
const LANGUAGES: { value: PreferredLanguage; label: string }[] = [
  { value: "id", label: "Indonesian (Bahasa Indonesia)" },
  { value: "en", label: "English" },
  { value: "ja", label: "Japanese (日本語)" },
];

export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-10">
      <div>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Update your profile and manage your account.
        </p>
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

  const [form, setForm] = useState<ProfileUpdateRequest>({});
  const [saved, setSaved] = useState(false);

  // Populate form once data arrives
  useEffect(() => {
    if (!me?.profile) return;
    const p = me.profile;
    setForm({
      nationality:        p.nationality ?? undefined,
      japanese_level:     p.japanese_level,
      visa_status:        p.visa_status,
      preferred_language: p.preferred_language,
      years_experience:   p.years_experience ?? undefined,
      target_role:        p.target_role ?? [],
      target_industry:    p.target_industry ?? [],
    });
  }, [me]);

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

  return (
    <section className="space-y-6">
      <h2 className="text-base font-semibold">Profile</h2>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Nationality */}
        <Field label="Nationality">
          <input
            type="text"
            value={form.nationality ?? ""}
            onChange={(e) => handleChange("nationality", e.target.value || undefined)}
            placeholder="e.g. Indonesian"
            className={inputCls}
          />
        </Field>

        {/* Japanese level */}
        <Field label="Japanese level (JLPT)">
          <select
            value={form.japanese_level ?? "none"}
            onChange={(e) => handleChange("japanese_level", e.target.value as JapaneseLevel)}
            className={inputCls}
          >
            {JAPANESE_LEVELS.map((l) => (
              <option key={l} value={l}>
                {l === "none" ? "Not tested / below N5" : l}
              </option>
            ))}
          </select>
        </Field>

        {/* Visa status */}
        <Field label="Current visa status">
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

        {/* Years of experience */}
        <Field label="Years of work experience">
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

        {/* Target roles */}
        <Field
          label="Target roles"
          hint="Comma-separated list of job titles you're targeting"
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

        {/* Target industries */}
        <Field
          label="Target industries"
          hint="Comma-separated list of industries you're interested in"
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

        {/* Preferred language */}
        <Field label="Preferred language">
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
            {(updateProfile.error as { detail?: string }).detail ??
              "Failed to save. Please try again."}
          </p>
        )}

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={updateProfile.isPending}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {updateProfile.isPending ? "Saving…" : "Save changes"}
          </button>
          {saved && !updateProfile.isPending && (
            <p className="text-sm text-green-600">Saved!</p>
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
  const [showConfirm, setShowConfirm] = useState(false);
  const [confirmText, setConfirmText] = useState("");

  const CONFIRM_PHRASE = "delete my account";
  const ready = confirmText.toLowerCase() === CONFIRM_PHRASE;

  async function handleDelete() {
    if (!ready) return;
    await deleteAccount.mutateAsync();
    // Sign out locally then redirect — Clerk sessions are revoked server-side
    await signOut();
    router.push("/sign-in");
  }

  return (
    <section className="space-y-4">
      <h2 className="text-base font-semibold text-destructive">Danger zone</h2>

      <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-5 space-y-4">
        <div>
          <p className="text-sm font-medium">Delete account</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Permanently delete your account and all associated data — resumes, documents, job
            postings, interview sessions, and visa consultations. This action cannot be undone.
          </p>
        </div>

        {!showConfirm ? (
          <button
            onClick={() => setShowConfirm(true)}
            className="rounded-md border border-destructive px-3 py-1.5 text-sm text-destructive hover:bg-destructive/10"
          >
            Delete my account
          </button>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Type <span className="font-mono font-medium text-foreground">{CONFIRM_PHRASE}</span>{" "}
              to confirm.
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
                  "Failed to delete account. Please try again."}
              </p>
            )}

            <div className="flex gap-3">
              <button
                onClick={handleDelete}
                disabled={!ready || deleteAccount.isPending}
                className="rounded-md bg-destructive px-3 py-1.5 text-sm font-medium text-destructive-foreground hover:opacity-90 disabled:opacity-40"
              >
                {deleteAccount.isPending ? "Deleting…" : "Confirm deletion"}
              </button>
              <button
                onClick={() => {
                  setShowConfirm(false);
                  setConfirmText("");
                }}
                className="rounded-md border px-3 py-1.5 text-sm hover:bg-accent"
              >
                Cancel
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
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium">{label}</label>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      {children}
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
