"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useClerk } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDeleteAccount } from "@/hooks/useAccount";
import { apiErrorMessage } from "@/lib/api-error";
import { t, type Language } from "@/lib/i18n";
import { SIGN_IN_ROUTE } from "@/lib/routes";

/** Account deletion, behind a typed phrase. Not part of the settings form. */
export function DeleteAccountCard({ lang }: { lang: Language }) {
  const router = useRouter();
  const { signOut } = useClerk();
  const deleteAccount = useDeleteAccount();
  const [showConfirm, setShowConfirm] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const s = (key: string) => t("settings", key, lang);

  const phrase = s("confirmPhrase");
  const ready = confirmText.toLowerCase() === phrase.toLowerCase();

  async function handleDelete() {
    if (!ready) return;
    try {
      await deleteAccount.mutateAsync();
    } catch {
      // The account is still there, so stay on the page with the reader
      // signed in; deleteAccount.error renders the reason below. Signing
      // them out here would strand them at the sign-in page with an account
      // they asked to delete and still have.
      return;
    }
    try {
      await signOut();
    } catch {
      // The account is gone by this point, so there is nothing to report and
      // nowhere useful to stay. Leaving them on a settings page for an
      // account that no longer exists -- with nothing rendered, since
      // deleteAccount succeeded and has no error -- is the worst outcome
      // available, so fall through to the redirect either way.
    }
    router.push(SIGN_IN_ROUTE);
  }

  return (
    <section
      aria-labelledby="delete-account-title"
      className="rounded-lg border border-destructive/30 bg-card p-5 sm:p-6"
    >
      <h2 id="delete-account-title" className="text-base font-semibold text-destructive">
        {s("deleteAccount")}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">{s("deleteDesc")}</p>

      {!showConfirm ? (
        <Button variant="destructive" className="mt-4" onClick={() => setShowConfirm(true)}>
          {s("deleteBtn")}
        </Button>
      ) : (
        <div className="mt-4 space-y-3">
          <p className="text-sm text-muted-foreground">
            {s("typeToConfirm")}{" "}
            <span className="font-mono font-medium text-foreground">{phrase}</span> {s("toConfirm")}
          </p>
          <Input
            aria-label={phrase}
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder={phrase}
            className="font-mono"
            autoFocus
          />
          {deleteAccount.error && (
            <p role="alert" className="text-sm text-destructive">
              {apiErrorMessage(deleteAccount.error, lang)}
            </p>
          )}
          <div className="flex gap-3">
            <Button
              variant="destructive"
              disabled={!ready}
              loading={deleteAccount.isPending}
              onClick={() => void handleDelete()}
            >
              {deleteAccount.isPending ? s("deleting") : s("confirmDeletion")}
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setShowConfirm(false);
                setConfirmText("");
              }}
            >
              {t("common", "cancel", lang)}
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
