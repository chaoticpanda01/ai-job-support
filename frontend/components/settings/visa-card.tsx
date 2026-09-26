"use client";

import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { SettingsCard, type CardProps } from "@/components/settings/settings-card";
import { fieldId } from "@/lib/rirekisho-completeness";
import { t } from "@/lib/i18n";
import { isChanged } from "@/lib/settings-form";
import type { VisaStatus } from "@/types/api";

export function VisaCard({ values, saved, update, lang }: CardProps) {
  const s = (key: string) => t("settings", key, lang);
  const changed = (key: keyof typeof values) => isChanged(saved, values, key);
  // Category and expiry are needed only once a visa is held, and this reads
  // the unsaved status, so the tags change as soon as the status does.
  const optional = values.visa_status === "held" ? undefined : s("optional");
  return (
    <SettingsCard id="visa" title={s("sectionVisa")} description={s("visaDesc")}>
      <SegmentedControl<VisaStatus>
        legend={s("visaStatus")}
        name="visa_status"
        value={values.visa_status}
        onChange={(value) => update("visa_status", value)}
        options={[
          { value: "none", label: s("visaNone") },
          { value: "pending", label: s("visaPending") },
          { value: "held", label: s("visaHeld") },
        ]}
        className="md:col-span-2"
      />
      <Field label={s("visaCategory")} optionalLabel={optional}>
        <Input
          id={fieldId("visa_category")}
          value={values.visa_category}
          onChange={(e) => update("visa_category", e.target.value)}
          changed={changed("visa_category")}
        />
      </Field>
      <Field label={s("visaExpiration")} optionalLabel={optional}>
        <Input
          id={fieldId("residence_card_expiration")}
          type="date"
          value={values.residence_card_expiration}
          onChange={(e) => update("residence_card_expiration", e.target.value)}
          changed={changed("residence_card_expiration")}
        />
      </Field>
    </SettingsCard>
  );
}
