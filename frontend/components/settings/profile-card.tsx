"use client";

import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { PhotoUploader } from "@/components/profile/PhotoUploader";
import { SettingsCard, type CardProps } from "@/components/settings/settings-card";
import { fieldId } from "@/lib/rirekisho-completeness";
import { t } from "@/lib/i18n";
import { isChanged } from "@/lib/settings-form";
import type { Gender } from "@/types/api";

export function ProfileCard({ values, saved, update, lang, email }: CardProps & { email: string }) {
  const s = (key: string) => t("settings", key, lang);
  const changed = (key: keyof typeof values) => isChanged(saved, values, key);
  return (
    <SettingsCard id="profile" title={s("profile")} description={s("profileDesc")}>
      <Field label={s("fullName")}>
        <Input
          id={fieldId("full_name")}
          value={values.full_name}
          onChange={(e) => update("full_name", e.target.value)}
          changed={changed("full_name")}
        />
      </Field>
      <Field label={s("nameKana")}>
        <Input
          id={fieldId("name_kana")}
          lang="ja"
          placeholder="ヤマダ タロウ"
          value={values.name_kana}
          onChange={(e) => update("name_kana", e.target.value)}
          changed={changed("name_kana")}
        />
      </Field>
      <Field label={s("dateOfBirth")}>
        <Input
          id={fieldId("date_of_birth")}
          type="date"
          value={values.date_of_birth}
          onChange={(e) => update("date_of_birth", e.target.value)}
          changed={changed("date_of_birth")}
        />
      </Field>
      <Field label={s("gender")}>
        <Select
          id={fieldId("gender")}
          value={values.gender}
          onChange={(e) => update("gender", e.target.value as Gender | "")}
          changed={changed("gender")}
        >
          <option value="" disabled>
            {s("genderSelect")}
          </option>
          <option value="male">{s("genderMale")}</option>
          <option value="female">{s("genderFemale")}</option>
        </Select>
      </Field>
      <Field label={s("nationality")} optionalLabel={s("optional")}>
        <Input
          value={values.nationality}
          onChange={(e) => update("nationality", e.target.value)}
          changed={changed("nationality")}
        />
      </Field>
      <Field label={s("phone")}>
        <Input
          id={fieldId("phone_number")}
          type="tel"
          value={values.phone_number}
          onChange={(e) => update("phone_number", e.target.value)}
          changed={changed("phone_number")}
        />
      </Field>
      <Field label={s("address")} className="md:col-span-2">
        <Input
          id={fieldId("mailing_address")}
          value={values.mailing_address}
          onChange={(e) => update("mailing_address", e.target.value)}
          changed={changed("mailing_address")}
        />
      </Field>
      <Field label={s("email")} hint={s("emailHint")}>
        <Input value={email} readOnly />
      </Field>
      <div className="space-y-1.5">
        <p className="flex items-baseline gap-2 text-sm font-medium">
          {s("photo")}
          <span className="text-xs font-normal text-muted-foreground">{s("optional")}</span>
        </p>
        <PhotoUploader />
        <p className="text-xs text-muted-foreground">{s("photoHint")}</p>
      </div>
    </SettingsCard>
  );
}
