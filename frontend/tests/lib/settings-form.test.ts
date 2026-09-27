import { describe, expect, it } from "vitest";
import {
  DEFAULT_PERSONAL_REQUESTS,
  changedFields,
  formFromProfile,
  isChanged,
  settleAfterSave,
  validateSettings,
} from "@/lib/settings-form";
import type { MeResponse, Profile } from "@/types/api";

const PROFILE = {
  nationality: "Indonesian",
  japanese_level: "N2",
  target_industry: ["IT"],
  target_role: ["SRE"],
  years_experience: 5,
  visa_status: "none",
  name_kana: "ヤマダ タロウ",
  date_of_birth: "1995-04-15",
  gender: "male",
  phone_number: "090",
  mailing_address: "Tokyo",
  residence_card_expiration: null,
  visa_category: null,
  hobbies: null,
  special_skills: null,
  personal_requests: null,
  commute_time: null,
  dependents: null,
} as unknown as Profile;

const me = (profile: Partial<Profile> | null = {}, full_name: string | null = "山田 太郎") =>
  ({
    user: { full_name, email: "a@example.test" },
    profile: profile === null ? null : { ...PROFILE, ...profile },
  }) as MeResponse;

describe("formFromProfile", () => {
  it("fills every field, with empty text as an empty string", () => {
    const values = formFromProfile(me());
    expect(values).toMatchObject({
      full_name: "山田 太郎",
      name_kana: "ヤマダ タロウ",
      gender: "male",
      visa_status: "none",
      visa_category: "",
      residence_card_expiration: "",
      years_experience: "5",
      target_role: ["SRE"],
    });
  });

  it("offers the standard request phrase when none was saved", () => {
    expect(formFromProfile(me()).personal_requests).toBe(DEFAULT_PERSONAL_REQUESTS);
  });

  it("copes with a user who has no profile yet", () => {
    const values = formFromProfile(me(null, null));
    expect(values).toMatchObject({ full_name: "", visa_status: "none", japanese_level: "none" });
  });
});

describe("changedFields", () => {
  const saved = formFromProfile(me());

  it("is empty until something is edited", () => {
    expect(changedFields(saved, { ...saved })).toEqual({});
  });

  it("holds only what was edited", () => {
    expect(changedFields(saved, { ...saved, phone_number: "080" })).toEqual({
      phone_number: "080",
    });
  });

  it("sends a cleared text field as an empty string, which clears it", () => {
    expect(changedFields(saved, { ...saved, mailing_address: "" })).toEqual({
      mailing_address: "",
    });
  });

  it("does not count emptying a field the backend can't clear", () => {
    // An empty date or gender is a 422; an absent number is dropped.
    const emptied = { ...saved, date_of_birth: "", gender: "" as const, years_experience: "" };
    expect(changedFields(saved, emptied)).toEqual({});
  });

  it("sends years of experience as a number", () => {
    expect(changedFields(saved, { ...saved, years_experience: "8" })).toEqual({
      years_experience: 8,
    });
  });

  it("compares lists by content, in order", () => {
    expect(changedFields(saved, { ...saved, target_role: ["SRE"] })).toEqual({});
    expect(changedFields(saved, { ...saved, target_role: ["SRE", "QA"] })).toEqual({
      target_role: ["SRE", "QA"],
    });
  });

  it("forgets an edit that was put back", () => {
    expect(changedFields(saved, { ...saved, phone_number: "090" })).toEqual({});
  });
});

describe("isChanged", () => {
  const saved = formFromProfile(me());
  it("agrees with changedFields that emptying an unclearable field is no change", () => {
    // Otherwise the field is outlined as edited while the save bar, which
    // counts changedFields, says there is nothing to save.
    const values = { ...saved, date_of_birth: "", years_experience: "" };
    expect(isChanged(saved, values, "date_of_birth")).toBe(false);
    expect(isChanged(saved, values, "years_experience")).toBe(false);
    expect(isChanged(saved, { ...saved, hobbies: "" }, "hobbies")).toBe(false);
    expect(isChanged(saved, { ...saved, phone_number: "" }, "phone_number")).toBe(true);
  });

  it("says which fields differ", () => {
    const values = { ...saved, hobbies: "Hiking" };
    expect(isChanged(saved, values, "hobbies")).toBe(true);
    expect(isChanged(saved, values, "phone_number")).toBe(false);
  });
});

describe("settleAfterSave", () => {
  it("puts back a field that couldn't be cleared, since it wasn't", () => {
    const saved = formFromProfile(me());
    const values = { ...saved, date_of_birth: "", phone_number: "080" };
    expect(settleAfterSave(saved, values)).toEqual({
      ...saved,
      phone_number: "080",
    });
  });
});

describe("validateSettings", () => {
  const saved = formFromProfile(me());

  it.each(["-1", "81", "2.5"])("refuses %s years of experience", (years) => {
    // A key, not text: the card translates it when it renders, so the message
    // follows a language switch while it's showing.
    expect(validateSettings({ ...saved, years_experience: years })).toEqual({
      years_experience: "yearsRange",
    });
  });

  it.each(["", "0", "80"])("accepts %s", (years) => {
    expect(validateSettings({ ...saved, years_experience: years })).toEqual({});
  });
});
