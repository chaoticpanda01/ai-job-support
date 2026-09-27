import { t, type Language } from "@/lib/i18n";
import type { VisaStatus } from "@/types/api";

/**
 * Which of the fields a 履歴書 needs are still missing: a deliberate, bounded
 * copy of rirekisho_missing_fields() (backend/app/services/
 * rirekisho_completeness.py), so the Settings banner can update as the user
 * types. tests/invariants.test.ts checks this file against the backend.
 */

/** The fields the rules read. Empty strings count as missing, like undefined. */
export interface CompletenessFields {
  full_name?: string | undefined;
  name_kana?: string | undefined;
  date_of_birth?: string | undefined;
  gender?: string | undefined;
  phone_number?: string | undefined;
  mailing_address?: string | undefined;
  visa_category?: string | undefined;
  residence_card_expiration?: string | undefined;
}

/** The id each required field's input carries, so the banner can focus it. */
export function fieldId(key: string): string {
  return `rirekisho-field-${key}`;
}

// Keys mirror rirekisho_missing_fields()'s "key" values in
// backend/app/services/rirekisho_completeness.py — kept in sync manually,
// see the comment on computeMissingRirekishoFields below.
export const REQUIRED_FIELD_LABEL_KEYS: Record<string, string> = {
  full_name: "fullName",
  name_kana: "nameKana",
  date_of_birth: "dateOfBirth",
  gender: "gender",
  phone_number: "phone",
  mailing_address: "address",
  visa_category: "visaCategory",
  residence_card_expiration: "visaExpiration",
};

export function missingFieldLabel(key: string, lang: Language): string {
  return t("settings", REQUIRED_FIELD_LABEL_KEYS[key] ?? key, lang);
}

// The full set of keys computeMissingRirekishoFields() can report, split
// into always-required and visa-held-only. applicableRequiredKeys() is the
// one place each key's applicability is decided.
export const BASE_REQUIRED_KEYS = [
  "full_name",
  "name_kana",
  "date_of_birth",
  "gender",
  "phone_number",
  "mailing_address",
] as const;
export const VISA_HELD_REQUIRED_KEYS = ["visa_category", "residence_card_expiration"] as const;

export function applicableRequiredKeys(visaStatus: VisaStatus | undefined): readonly string[] {
  return visaStatus === "held"
    ? [...BASE_REQUIRED_KEYS, ...VISA_HELD_REQUIRED_KEYS]
    : BASE_REQUIRED_KEYS;
}

/**
 * date_of_birth is a "YYYY-MM-DD" date-only string. `new Date(str)` parses
 * that as UTC midnight, but getMonth()/getDate() read it back in the
 * browser's local timezone — in any timezone behind UTC this silently
 * rolls the parsed date back a day, which can flip the 16/80 age boundary
 * a day early. Parsing the components directly keeps this in local time
 * throughout, matching how <input type="date"> treats it.
 */
export function isDateOfBirthMissing(dateOfBirth: string | undefined): boolean {
  if (!dateOfBirth) return true;

  // <input type="date"> always yields "YYYY-MM-DD"; the "0" fallbacks
  // only satisfy noUncheckedIndexedAccess and are never actually hit.
  const [dobYearStr = "0", dobMonthStr = "0", dobDayStr = "0"] = dateOfBirth.split("-");
  const dob = new Date(Number(dobYearStr), Number(dobMonthStr) - 1, Number(dobDayStr));
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const hadBirthdayThisYear =
    today.getMonth() > dob.getMonth() ||
    (today.getMonth() === dob.getMonth() && today.getDate() >= dob.getDate());
  if (!hadBirthdayThisYear) age -= 1;
  return age < 16 || age > 80;
}

export function isFieldMissing(key: string, form: CompletenessFields): boolean {
  switch (key) {
    case "full_name":
      return !form.full_name;
    case "name_kana":
      return !form.name_kana;
    case "date_of_birth":
      return isDateOfBirthMissing(form.date_of_birth);
    case "gender":
      return !form.gender;
    case "phone_number":
      return !form.phone_number;
    case "mailing_address":
      return !form.mailing_address;
    case "visa_category":
      return !form.visa_category;
    case "residence_card_expiration":
      return !form.residence_card_expiration;
    default:
      return false;
  }
}

/**
 * Deliberate, bounded duplication of a subset of
 * rirekisho_missing_fields() (backend/app/services/rirekisho_completeness.py):
 * simple presence checks, the date-of-birth age-range rule, and the
 * visa-held conditional. Needed so the Settings banner can update as the
 * user types, without a network round-trip per keystroke. If the backend's
 * required-field set changes, both BASE_REQUIRED_KEYS/VISA_HELD_REQUIRED_KEYS
 * above and isFieldMissing() must be updated too — everywhere else (the
 * rirekisho generation wizard) reads the backend's computed answer directly
 * with no duplication at all.
 */
export function computeMissingRirekishoFields(
  form: CompletenessFields,
  visaStatus: VisaStatus | undefined,
): string[] {
  return applicableRequiredKeys(visaStatus).filter((key) => isFieldMissing(key, form));
}
