"use client";

import { Button } from "@/components/ui/button";
import { useLang } from "@/lib/language-context";
import { t } from "@/lib/i18n";

/**
 * "Try again" for a failed load. While it runs it is Button's loading state:
 * aria-disabled and aria-busy, never disabled, so keyboard focus stays on it.
 */
export function RetryButton({
  retrying,
  onRetry,
  size = "sm",
}: {
  retrying: boolean;
  onRetry: () => void;
  size?: "sm" | "md";
}) {
  const { lang } = useLang();
  return (
    <Button type="button" variant="secondary" size={size} loading={retrying} onClick={onRetry}>
      {t("common", retrying ? "retrying" : "tryAgain", lang)}
    </Button>
  );
}
