"use client";

import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { t, type Language } from "@/lib/i18n";

/**
 * Fixed to the bottom of the screen while there are unsaved changes. It sets
 * --save-bar-offset to its height, which the chat button adds to its bottom
 * margin, so the button never covers Save.
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

  useEffect(() => {
    const bar = ref.current;
    if (!bar) return;
    const root = document.documentElement;
    const setOffset = () => root.style.setProperty("--save-bar-offset", `${bar.offsetHeight}px`);
    setOffset();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(setOffset);
    observer?.observe(bar);
    return () => {
      observer?.disconnect();
      root.style.removeProperty("--save-bar-offset");
    };
  }, []);

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
