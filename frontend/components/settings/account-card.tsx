"use client";

import { LanguageSwitcher } from "@/components/language-switcher";
import { SettingsCard } from "@/components/settings/settings-card";
import { t, type Language } from "@/lib/i18n";

/** The app language: acts at once through the switcher's cookie, outside the form's Save. */
export function AccountCard({ lang }: { lang: Language }) {
  const s = (key: string) => t("settings", key, lang);
  return (
    <SettingsCard id="account" title={s("sectionAccount")}>
      <div className="space-y-1.5 md:col-span-2">
        <p className="text-sm font-medium">{s("appLanguage")}</p>
        {/* The switcher is a flex row that would otherwise fill the card. */}
        <div className="w-fit">
          <LanguageSwitcher />
        </div>
        <p className="text-xs text-muted-foreground">{s("appLanguageHint")}</p>
      </div>
    </SettingsCard>
  );
}
