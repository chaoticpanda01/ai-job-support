import { z } from "zod";
import type {
  Gender,
  JapaneseLevel,
  MeResponse,
  ProfileUpdateRequest,
  VisaStatus,
} from "@/types/api";

/**
 * Every value the Settings form edits, as its controls hold them: empty text
 * is "" (not undefined), and years of experience is the number input's
 * string. Email, the photo and the app language are not here: they are
 * read-only or save on their own.
 */
export interface SettingsValues {
  full_name: string;
  name_kana: string;
  date_of_birth: string;
  gender: Gender | "";
  nationality: string;
  phone_number: string;
  mailing_address: string;
  visa_status: VisaStatus;
  visa_category: string;
  residence_card_expiration: string;
  hobbies: string;
  special_skills: string;
  commute_time: string;
  dependents: string;
  personal_requests: string;
  japanese_level: JapaneseLevel;
  years_experience: string;
  target_role: string[];
  target_industry: string[];
}

/**
 * Keys into the settings strings, not the text itself: the field translates
 * its error when it renders, so the message follows a language switch.
 */
export type SettingsErrorKey = "yearsRange";
export type SettingsErrors = Partial<Record<keyof SettingsValues, SettingsErrorKey>>;

/** "I will follow your company's rules": what a 履歴書 says when there's no request. */
export const DEFAULT_PERSONAL_REQUESTS = "貴社の規定に従います。";

/**
 * Fields the backend can't set to empty: an empty date or gender fails
 * validation (422), and an absent number is dropped by exclude_none. Emptying
 * one is therefore not a change, rather than an edit that could never save.
 */
const NOT_CLEARABLE = new Set<keyof SettingsValues>([
  "date_of_birth",
  "residence_card_expiration",
  "gender",
  "years_experience",
]);

export function formFromProfile(me: MeResponse): SettingsValues {
  const p = me.profile;
  return {
    full_name: me.user.full_name ?? "",
    name_kana: p?.name_kana ?? "",
    date_of_birth: p?.date_of_birth ?? "",
    gender: p?.gender ?? "",
    nationality: p?.nationality ?? "",
    phone_number: p?.phone_number ?? "",
    mailing_address: p?.mailing_address ?? "",
    visa_status: p?.visa_status ?? "none",
    visa_category: p?.visa_category ?? "",
    residence_card_expiration: p?.residence_card_expiration ?? "",
    hobbies: p?.hobbies ?? "",
    special_skills: p?.special_skills ?? "",
    commute_time: p?.commute_time ?? "",
    dependents: p?.dependents ?? "",
    personal_requests: p?.personal_requests ?? DEFAULT_PERSONAL_REQUESTS,
    japanese_level: p?.japanese_level ?? "none",
    years_experience:
      p?.years_experience === null || p?.years_experience === undefined
        ? ""
        : String(p.years_experience),
    target_role: [...(p?.target_role ?? [])],
    target_industry: [...(p?.target_industry ?? [])],
  };
}

function same(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, i) => item === b[i]);
  }
  return a === b;
}

/** Whether the backend can store this field as empty (see NOT_CLEARABLE). */
export function canClear(key: keyof SettingsValues): boolean {
  return !NOT_CLEARABLE.has(key);
}

/**
 * Whether this field holds an unsaved change: it differs from what's saved,
 * and it isn't an emptied field the backend can't clear. The outline on the
 * field and the save bar's count both go by this, so they always agree.
 */
export function isChanged(
  saved: SettingsValues,
  values: SettingsValues,
  key: keyof SettingsValues,
): boolean {
  const value = values[key];
  if (same(saved[key], value)) return false;
  return !(value === "" && !canClear(key));
}

/**
 * The update to send: only the fields that differ from what's saved and that
 * the backend can actually take (see NOT_CLEARABLE). Its size is the save
 * bar's "N unsaved changes".
 */
export function changedFields(saved: SettingsValues, values: SettingsValues): ProfileUpdateRequest {
  const update: Record<string, unknown> = {};
  for (const key of Object.keys(values) as (keyof SettingsValues)[]) {
    if (!isChanged(saved, values, key)) continue;
    const value = values[key];
    update[key] = key === "years_experience" ? Number(value) : value;
  }
  return update as ProfileUpdateRequest;
}

/**
 * What the form holds after a successful save: what was sent, plus the saved
 * value back in any field whose emptying wasn't sent, so the screen shows
 * what's actually stored.
 */
export function settleAfterSave(saved: SettingsValues, values: SettingsValues): SettingsValues {
  const settled = { ...values };
  for (const key of NOT_CLEARABLE) {
    if (values[key] === "") (settled as Record<string, unknown>)[key] = saved[key];
  }
  return settled;
}

const yearsSchema = z.coerce.number().int().min(0).max(80);

/** Errors to show before sending. Missing 履歴書 fields never block a save. */
export function validateSettings(values: SettingsValues): SettingsErrors {
  if (values.years_experience !== "" && !yearsSchema.safeParse(values.years_experience).success) {
    return { years_experience: "yearsRange" };
  }
  return {};
}
