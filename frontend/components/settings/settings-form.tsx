"use client";

import { useState } from "react";
import { AccountCard } from "@/components/settings/account-card";
import { CareerCard } from "@/components/settings/career-card";
import { CompletenessBanner } from "@/components/settings/completeness-banner";
import { DeleteAccountCard } from "@/components/settings/delete-account-card";
import { ExtrasCard } from "@/components/settings/extras-card";
import { ProfileCard } from "@/components/settings/profile-card";
import { SaveBar } from "@/components/settings/save-bar";
import { VisaCard } from "@/components/settings/visa-card";
import { useToast } from "@/hooks/use-toast";
import { useUpdateProfile } from "@/hooks/useMe";
import { apiErrorMessage } from "@/lib/api-error";
import { useLang } from "@/lib/language-context";
import { t } from "@/lib/i18n";
import { computeMissingRirekishoFields } from "@/lib/rirekisho-completeness";
import {
  changedFields,
  formFromProfile,
  settleAfterSave,
  validateSettings,
  type SettingsErrors,
  type SettingsValues,
} from "@/lib/settings-form";
import type { MeResponse } from "@/types/api";

/**
 * The whole of Settings as one form: every card edits the same values, and
 * one save bar sends whatever differs from what's saved. Photo, app language
 * and account deletion act on their own and are outside it.
 */
export function SettingsForm({ me }: { me: MeResponse }) {
  const { lang } = useLang();
  const updateProfile = useUpdateProfile();
  const { toast } = useToast();

  const [saved, setSaved] = useState<SettingsValues>(() => formFromProfile(me));
  const [values, setValues] = useState<SettingsValues>(saved);
  const [errors, setErrors] = useState<SettingsErrors>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  // Bumped on Discard, so cards with local state (the switches) start over.
  const [resetKey, setResetKey] = useState(0);

  const changes = changedFields(saved, values);
  const count = Object.keys(changes).length;
  // The unsaved visa status counts, so the banner reacts as soon as it changes.
  const missingKeys = computeMissingRirekishoFields(values, values.visa_status);

  function update<K extends keyof SettingsValues>(key: K, value: SettingsValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
    if (key === "years_experience") setErrors({});
    setSaveError(null);
  }

  function discard() {
    setValues(saved);
    setErrors({});
    setSaveError(null);
    setResetKey((key) => key + 1);
  }

  async function save() {
    const found = validateSettings(values, lang);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    setSaveError(null);
    try {
      await updateProfile.mutateAsync(changes);
    } catch (error) {
      // Kept on screen with the edits; swallowed here only so a rejected
      // mutateAsync isn't an unhandled rejection.
      setSaveError(apiErrorMessage(error, lang));
      return;
    }
    const settled = settleAfterSave(saved, values);
    setSaved(settled);
    setValues(settled);
    toast({ variant: "success", description: t("common", "saved", lang) });
  }

  const cardProps = { values, saved, errors, update, lang };

  return (
    <div className="min-w-0 space-y-6 pb-28">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
        className="space-y-6"
      >
        <CompletenessBanner missingKeys={missingKeys} lang={lang} />
        <ProfileCard {...cardProps} email={me.user.email} />
        <VisaCard {...cardProps} />
        <ExtrasCard key={resetKey} {...cardProps} />
        <CareerCard {...cardProps} />
        <AccountCard lang={lang} />
        {count > 0 && (
          <SaveBar
            count={count}
            saving={updateProfile.isPending}
            error={saveError}
            onDiscard={discard}
            lang={lang}
          />
        )}
      </form>
      <DeleteAccountCard lang={lang} />
    </div>
  );
}
