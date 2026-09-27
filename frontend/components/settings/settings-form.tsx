"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useConfirm } from "@/components/confirm-dialog-provider";
import { AccountCard } from "@/components/settings/account-card";
import { CareerCard } from "@/components/settings/career-card";
import { CompletenessBanner } from "@/components/settings/completeness-banner";
import { DeleteAccountCard } from "@/components/settings/delete-account-card";
import { ExtrasCard } from "@/components/settings/extras-card";
import { ProfileCard } from "@/components/settings/profile-card";
import { SaveBar } from "@/components/settings/save-bar";
import { SectionNav } from "@/components/settings/section-nav";
import { useLeaveGuard } from "@/components/settings/use-leave-guard";
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

  // Discard and Save close the bar under the focused button, which would drop
  // a keyboard user's focus to <body>. So remember the last field focused
  // outside the bar, and when the bar closes with focus in it, go back there
  // (or to the form, if Discard remounted that field away).
  const formRef = useRef<HTMLFormElement>(null);
  const lastField = useRef<HTMLElement | null>(null);
  const refocusAfterClose = useRef(false);
  function noteFocusInBar() {
    refocusAfterClose.current = Boolean(document.activeElement?.closest("[data-save-bar]"));
  }
  useEffect(() => {
    if (count > 0 || !refocusAfterClose.current) return;
    refocusAfterClose.current = false;
    const field = lastField.current;
    (field?.isConnected ? field : formRef.current)?.focus();
  }, [count]);

  const confirm = useConfirm();
  const confirmLeave = useCallback(
    () =>
      confirm({
        title: t("settings", "leaveTitle", lang),
        confirmLabel: t("settings", "discard", lang),
        cancelLabel: t("settings", "keepEditing", lang),
        variant: "destructive",
      }),
    [confirm, lang],
  );
  useLeaveGuard(count > 0, confirmLeave);
  // The unsaved visa status counts, so the banner reacts as soon as it changes.
  const missingKeys = computeMissingRirekishoFields(values, values.visa_status);

  function update<K extends keyof SettingsValues>(key: K, value: SettingsValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
    if (key === "years_experience") setErrors({});
    setSaveError(null);
  }

  function discard() {
    noteFocusInBar();
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
    noteFocusInBar();
    const settled = settleAfterSave(saved, values);
    setSaved(settled);
    setValues(settled);
    toast({ variant: "success", description: t("common", "saved", lang) });
  }

  const cardProps = { values, saved, errors, update, lang };

  return (
    <div className="lg:grid lg:grid-cols-[150px_minmax(0,1fr)] lg:gap-8">
      <SectionNav lang={lang} />
      <div className="min-w-0 space-y-6 pb-28">
        <form
          ref={formRef}
          // Only a fallback target for focus (see refocusAfterClose), never tabbed to.
          tabIndex={-1}
          onFocus={(event) => {
            if (!(event.target as Element).closest("[data-save-bar]")) {
              lastField.current = event.target as HTMLElement;
            }
          }}
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
          className="space-y-6 focus:outline-none"
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
    </div>
  );
}
