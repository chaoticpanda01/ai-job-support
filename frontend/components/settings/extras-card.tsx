"use client";

import { useId, useState } from "react";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { SettingsCard, type CardProps } from "@/components/settings/settings-card";
import { t } from "@/lib/i18n";
import { isChanged, type SettingsValues } from "@/lib/settings-form";

/**
 * A 履歴書 box that prints only when switched on. Switching off clears the
 * value (sent as "", which clears it), so the box leaves the 履歴書.
 */
function ToggleField({
  field,
  switchKey,
  labelKey,
  exampleKey,
  offKey,
  values,
  saved,
  update,
  lang,
}: Pick<CardProps, "values" | "saved" | "update" | "lang"> & {
  field: "commute_time" | "dependents";
  switchKey: string;
  labelKey: string;
  exampleKey: string;
  offKey: string;
}) {
  const s = (key: string) => t("settings", key, lang);
  const [on, setOn] = useState(values[field] !== "");
  const hintId = useId();
  return (
    <div className="space-y-2">
      <Switch
        checked={on}
        onCheckedChange={(next) => {
          setOn(next);
          if (!next) update(field, "");
        }}
        label={s(switchKey)}
        describedBy={on ? undefined : hintId}
      />
      {on ? (
        <>
          <Input
            aria-label={s(labelKey)}
            aria-describedby={hintId}
            value={values[field]}
            onChange={(e) => update(field, e.target.value)}
            changed={isChanged(saved, values, field)}
          />
          <p id={hintId} className="text-xs text-muted-foreground">
            {s(exampleKey)}
          </p>
        </>
      ) : (
        <p id={hintId} className="text-xs text-muted-foreground">
          {s(offKey)}
        </p>
      )}
    </div>
  );
}

export function ExtrasCard(props: CardProps) {
  const { values, saved, update, lang } = props;
  const s = (key: string) => t("settings", key, lang);
  const changed = (key: keyof SettingsValues) => isChanged(saved, values, key);
  return (
    <SettingsCard id="extras" title={s("sectionExtras")} description={s("extrasDesc")}>
      <Field label={s("hobbies")}>
        <Input
          value={values.hobbies}
          onChange={(e) => update("hobbies", e.target.value)}
          changed={changed("hobbies")}
        />
      </Field>
      <Field label={s("specialSkills")}>
        <Input
          value={values.special_skills}
          onChange={(e) => update("special_skills", e.target.value)}
          changed={changed("special_skills")}
        />
      </Field>
      <ToggleField
        {...props}
        field="commute_time"
        switchKey="showCommute"
        labelKey="commuteTime"
        exampleKey="commuteExample"
        offKey="commuteOff"
      />
      <ToggleField
        {...props}
        field="dependents"
        switchKey="showDependents"
        labelKey="dependents"
        exampleKey="dependentsExample"
        offKey="dependentsOff"
      />
      <Field
        label={s("personalRequests")}
        hint={s("personalRequestsHint")}
        className="md:col-span-2"
      >
        <Input
          lang="ja"
          value={values.personal_requests}
          onChange={(e) => update("personal_requests", e.target.value)}
          changed={changed("personal_requests")}
        />
      </Field>
    </SettingsCard>
  );
}
