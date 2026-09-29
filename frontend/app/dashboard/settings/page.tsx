"use client";

import { SettingsForm } from "@/components/settings/settings-form";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { useMe } from "@/hooks/useMe";
import { apiErrorMessage } from "@/lib/api-error";
import { useLang } from "@/lib/language-context";
import { t } from "@/lib/i18n";

export default function SettingsPage() {
  const { lang } = useLang();
  const { data: me, isLoading, error } = useMe();

  return (
    <>
      <PageHeader title={t("settings", "title", lang)} description={t("settings", "sub", lang)} />
      {isLoading ? (
        <SettingsSkeleton />
      ) : me ? (
        <SettingsForm me={me} />
      ) : (
        <p role="alert" className="text-sm text-destructive">
          {apiErrorMessage(error, lang)}
        </p>
      )}
    </>
  );
}

function SettingsSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-12 w-full" />
      {Array.from({ length: 3 }).map((_, i) => (
        <Skeleton key={i} className="h-64 w-full" />
      ))}
    </div>
  );
}
