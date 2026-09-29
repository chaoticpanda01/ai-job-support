"use client";

import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { useBottomBarOffset } from "@/hooks/useBottomBarOffset";
import { t, type Language } from "@/lib/i18n";

/**
 * Fixed to the bottom of the screen while there are unsaved changes. The chat
 * button rises above it, so it never covers Save.
 */
export function SaveBar({
  count,
  saving,
  error,
  onDiscard,
  lang,
}: {
  count: number;
  saving: boolean;
  error: string | null;
  onDiscard: () => void;
  lang: Language;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useBottomBarOffset(ref);

  const label =
    count === 1
      ? t("settings", "unsavedOne", lang)
      : t("settings", "unsavedMany", lang).replace("{n}", String(count));

  return (
    <div
      ref={ref}
      data-save-bar=""
      role="region"
      aria-label={label}
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-primary text-primary-foreground lg:left-60"
    >
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-10">
        <div className="min-w-0">
          <p aria-live="polite" className="text-sm font-semibold">
            {label}
          </p>
          {error && (
            <p role="alert" className="text-sm text-destructive-soft">
              {error}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <Button
            variant="ghost"
            onClick={onDiscard}
            className="text-primary-foreground hover:bg-primary-foreground/10"
          >
            {t("settings", "discard", lang)}
          </Button>
          <Button type="submit" variant="secondary" loading={saving}>
            {t("common", "saveChanges", lang)}
          </Button>
        </div>
      </div>
    </div>
  );
}
