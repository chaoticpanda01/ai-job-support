"use client";

import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { TagInput } from "@/components/ui/tag-input";
import { SettingsCard, type CardProps } from "@/components/settings/settings-card";
import { t } from "@/lib/i18n";
import { isChanged, type SettingsValues } from "@/lib/settings-form";
import type { JapaneseLevel } from "@/types/api";

const JAPANESE_LEVELS: JapaneseLevel[] = ["N1", "N2", "N3", "N4", "N5", "none"];

export function CareerCard({ values, saved, errors, update, lang }: CardProps) {
  const s = (key: string) => t("settings", key, lang);
  const changed = (key: keyof SettingsValues) => isChanged(saved, values, key);
  return (
    <SettingsCard id="career" title={s("sectionCareer")} description={s("careerDesc")}>
      <Field label={s("jpLevel")}>
        <Select
          value={values.japanese_level}
          onChange={(e) => update("japanese_level", e.target.value as JapaneseLevel)}
          changed={changed("japanese_level")}
        >
          {JAPANESE_LEVELS.map((level) => (
            <option key={level} value={level}>
              {level === "none" ? s("jpNotTested") : level}
            </option>
          ))}
        </Select>
      </Field>
      <Field label={s("yearsExp")} error={errors.years_experience}>
        <Input
          type="number"
          min={0}
          max={80}
          value={values.years_experience}
          onChange={(e) => update("years_experience", e.target.value)}
          changed={changed("years_experience")}
        />
      </Field>
      <Field label={s("targetRoles")} className="md:col-span-2">
        <TagInput
          value={values.target_role}
          onChange={(next) => update("target_role", next)}
          placeholder={s("addRole")}
          removeLabel={s("removeTag")}
          changed={changed("target_role")}
        />
      </Field>
      <Field label={s("targetIndustries")} className="md:col-span-2">
        <TagInput
          value={values.target_industry}
          onChange={(next) => update("target_industry", next)}
          placeholder={s("addIndustry")}
          removeLabel={s("removeTag")}
          changed={changed("target_industry")}
        />
      </Field>
    </SettingsCard>
  );
}
