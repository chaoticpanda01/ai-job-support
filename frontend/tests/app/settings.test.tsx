import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, screen, within, type RenderResult } from "@testing-library/react";
import { renderIn } from "../helpers";
import { ApiClientError } from "@/lib/api-client";
import { t } from "@/lib/i18n";
import { SIGN_IN_ROUTE } from "@/lib/routes";
import type { MeResponse, Profile, User, VisaStatus } from "@/types/api";

// jsdom has no layout, so the banner's scroll-into-view would throw.
Element.prototype.scrollIntoView = vi.fn();

const meQuery = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));
const updateProfile = vi.hoisted(() => ({
  current: {} as Record<string, unknown>,
  saves: [] as unknown[],
}));
const deleteAccount = vi.hoisted(() => ({ current: {} as Record<string, unknown>, calls: 0 }));
const session = vi.hoisted(() => ({
  signOuts: 0,
  pushes: [] as string[],
  signOutFails: false,
}));
const toasts = vi.hoisted(() => ({ list: [] as Array<{ description?: string }> }));
const confirm = vi.hoisted(() => ({ calls: 0, answer: true }));

vi.mock("@/hooks/useMe", () => ({
  useMe: () => meQuery.current,
  useUpdateProfile: () => updateProfile.current,
  useUploadPhoto: () => ({}),
}));
vi.mock("@/hooks/useAccount", () => ({ useDeleteAccount: () => deleteAccount.current }));
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: (t: { description?: string }) => toasts.list.push(t) }),
}));
vi.mock("@/components/confirm-dialog-provider", () => ({
  useConfirm: () => () => {
    confirm.calls += 1;
    return Promise.resolve(confirm.answer);
  },
}));
vi.mock("@clerk/nextjs", () => ({
  useClerk: () => ({
    signOut: () => {
      session.signOuts += 1;
      return session.signOutFails ? Promise.reject(new Error("clerk down")) : Promise.resolve();
    },
  }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: (url: string) => session.pushes.push(url) }),
}));
// Pulls in react-dropzone and the photo upload hook, which this page's own
// behaviour doesn't depend on.
vi.mock("@/components/profile/PhotoUploader", () => ({ PhotoUploader: () => null }));

const SettingsPage = (await import("@/app/dashboard/settings/page")).default;

const LANG = "ja";
const s = (key: Parameters<typeof t>[1]) => t("settings", key, LANG);
const common = (key: Parameters<typeof t>[1]) => t("common", key, LANG);

/** A "YYYY-MM-DD" birth date for someone who turns `years` old today, or `plusDays` later. */
function birthDateForAge(years: number, plusDays = 0): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - years);
  d.setDate(d.getDate() + plusDays);
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${month}-${day}`;
}

const COMPLETE_PROFILE: Profile = {
  id: "p1",
  user_id: "u1",
  nationality: "Indonesia",
  japanese_level: "N2",
  target_industry: [],
  target_role: [],
  years_experience: 5,
  current_location: null,
  target_location: null,
  visa_status: "none",
  preferred_language: "ja",
  onboarding_step: 5,
  onboarding_completed: true,
  consent_given_at: "2026-01-01T00:00:00Z",
  name_kana: "やまだ たろう",
  date_of_birth: birthDateForAge(30),
  gender: "male",
  phone_number: "090-0000-0000",
  mailing_address: "東京都渋谷区1-1-1",
  residence_card_expiration: null,
  visa_category: null,
  photo_storage_key: null,
  photo_url: null,
  hobbies: null,
  special_skills: null,
  personal_requests: null,
  commute_time: null,
  dependents: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

const USER: User = {
  id: "u1",
  clerk_id: "user_1",
  email: "taro@example.test",
  email_verified: true,
  full_name: "山田 太郎",
  subscription_tier: "free",
  role: "user",
  is_active: true,
  last_login_at: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  profile: null,
};

function me(profileOver: Partial<Profile> = {}, userOver: Partial<User> = {}): MeResponse {
  const profile = { ...COMPLETE_PROFILE, ...profileOver };
  return {
    user: { ...USER, ...userOver, profile },
    profile,
    rirekisho_ready: true,
    rirekisho_missing_fields: [],
  };
}

/** `null` renders with no profile data at all (`undefined` would take the default). */
async function renderPage(
  data: MeResponse | null = me(),
  over: Record<string, unknown> = {},
): Promise<RenderResult> {
  meQuery.current = { data: data ?? undefined, isLoading: false, error: null, ...over };
  let view: RenderResult | null = null;
  await act(async () => {
    view = renderIn(LANG, <SettingsPage />);
  });
  if (view === null) throw new Error("the page never rendered");
  return view as RenderResult;
}

/** "Your 履歴書 needs N more details:" in the page's language. */
function needs(n: number): string {
  return n === 1 ? s("rirekishoNeedsOne") : s("rirekishoNeedsMany").replace("{n}", String(n));
}

const field = (labelKey: Parameters<typeof s>[0]) =>
  screen.getByLabelText(new RegExp(s(labelKey))) as HTMLInputElement;
const saveButton = () => screen.getByRole("button", { name: common("saveChanges") });
const unsaved = (n: number) =>
  n === 1 ? s("unsavedOne") : s("unsavedMany").replace("{n}", String(n));

async function save() {
  await act(async () => {
    fireEvent.click(saveButton());
  });
}

beforeEach(() => {
  updateProfile.saves = [];
  updateProfile.current = {
    mutateAsync: (update: unknown) => {
      updateProfile.saves.push(update);
      return Promise.resolve();
    },
    isPending: false,
    error: null,
  };
  deleteAccount.calls = 0;
  deleteAccount.current = {
    mutateAsync: () => {
      deleteAccount.calls += 1;
      return Promise.resolve();
    },
    isPending: false,
    error: null,
  };
  session.signOuts = 0;
  session.pushes = [];
  session.signOutFails = false;
  toasts.list = [];
  confirm.calls = 0;
  confirm.answer = true;
  document.body.querySelectorAll("a[data-test-link]").forEach((a) => a.remove());
});

describe("settings page, the 履歴書 completeness banner", () => {
  it("says so when nothing is missing", async () => {
    await renderPage();
    expect(screen.getByText(s("rirekishoReady"))).toBeInTheDocument();
  });

  it("counts what is missing", async () => {
    await renderPage(me({ phone_number: null, mailing_address: null }));
    expect(screen.getByText(needs(2))).toBeInTheDocument();
  });

  it.each([
    ["full_name", "fullName"],
    ["name_kana", "nameKana"],
    ["gender", "gender"],
    ["phone_number", "phone"],
    ["mailing_address", "address"],
  ] as Array<[string, Parameters<typeof s>[0]]>)("counts a missing %s", async (key, labelKey) => {
    // One case per required field: without gender here, deleting its arm
    // from isFieldMissing passed the whole suite.
    await renderPage(key === "full_name" ? me({}, { full_name: null }) : me({ [key]: null }));
    expect(screen.getByText(needs(1))).toBeInTheDocument();
    expect(screen.getByRole("button", { name: s(labelKey) })).toBeInTheDocument();
  });

  it("moves focus to the field a reader picks from the list", async () => {
    await renderPage(me({ phone_number: null }));
    fireEvent.click(screen.getByRole("button", { name: s("phone") }));
    expect(document.activeElement).toBe(document.getElementById("rirekisho-field-phone_number"));
  });

  it("follows the form as it is edited, before any save", async () => {
    await renderPage(me({ phone_number: null }));
    fireEvent.change(document.getElementById("rirekisho-field-phone_number") as HTMLElement, {
      target: { value: "080" },
    });
    expect(screen.getByText(s("rirekishoReady"))).toBeInTheDocument();
  });
});

describe("settings page, the fields a held visa adds", () => {
  it("requires two more fields when a visa is held", async () => {
    await renderPage(me({ visa_status: "held" }));
    expect(screen.getByText(needs(2))).toBeInTheDocument();
    expect(screen.getByRole("button", { name: s("visaCategory") })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: s("visaExpiration") })).toBeInTheDocument();
  });

  it("requires them as soon as the status is changed, before saving", async () => {
    // visa_status used to live in the other form, so this only updated after
    // a save there.
    await renderPage();
    fireEvent.click(screen.getByRole("radio", { name: s("visaHeld") }));
    expect(screen.getByText(needs(2))).toBeInTheDocument();
  });

  it("counts them as met once they are filled in", async () => {
    await renderPage(
      me({
        visa_status: "held",
        visa_category: "技術・人文知識・国際業務",
        residence_card_expiration: "2030-01-01",
      }),
    );
    expect(screen.getByText(s("rirekishoReady"))).toBeInTheDocument();
  });

  it.each(["none", "pending"] as VisaStatus[])(
    "does not ask for them when the visa status is %s",
    async (visa_status) => {
      await renderPage(me({ visa_status }));
      expect(screen.getByText(s("rirekishoReady"))).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: s("visaCategory") })).not.toBeInTheDocument();
    },
  );
});

describe("settings page, the date of birth age range", () => {
  it("accepts someone who turns 16 today", async () => {
    await renderPage(me({ date_of_birth: birthDateForAge(16) }));
    expect(screen.getByText(s("rirekishoReady"))).toBeInTheDocument();
  });

  it("rejects someone whose 16th birthday is tomorrow", async () => {
    await renderPage(me({ date_of_birth: birthDateForAge(16, 1) }));
    expect(screen.getByText(needs(1))).toBeInTheDocument();
    expect(screen.getByRole("button", { name: s("dateOfBirth") })).toBeInTheDocument();
  });

  it("accepts someone who turns 80 today", async () => {
    await renderPage(me({ date_of_birth: birthDateForAge(80) }));
    expect(screen.getByText(s("rirekishoReady"))).toBeInTheDocument();
  });

  it("rejects someone who turned 81 yesterday", async () => {
    await renderPage(me({ date_of_birth: birthDateForAge(81, -1) }));
    expect(screen.getByText(needs(1))).toBeInTheDocument();
  });

  it("rejects a date of birth that was never given", async () => {
    await renderPage(me({ date_of_birth: null }));
    expect(screen.getByText(needs(1))).toBeInTheDocument();
  });
});

describe("settings page, the save bar", () => {
  it("stays out of the way until something is edited", async () => {
    await renderPage();
    expect(screen.queryByRole("button", { name: common("saveChanges") })).not.toBeInTheDocument();
  });

  it("counts the unsaved changes", async () => {
    await renderPage();
    fireEvent.change(field("phone"), { target: { value: "080" } });
    expect(screen.getByText(unsaved(1))).toBeInTheDocument();
    fireEvent.change(field("hobbies"), { target: { value: "登山" } });
    expect(screen.getByText(unsaved(2))).toBeInTheDocument();
  });

  it("sends only what changed, and leaves once it's saved", async () => {
    await renderPage();
    fireEvent.change(field("nameKana"), { target: { value: "すずき はなこ" } });
    await save();

    expect(updateProfile.saves).toEqual([{ name_kana: "すずき はなこ" }]);
    expect(toasts.list.map((toast) => toast.description)).toEqual([common("saved")]);
    expect(screen.queryByRole("button", { name: common("saveChanges") })).not.toBeInTheDocument();
  });

  it("puts everything back on Discard", async () => {
    await renderPage();
    fireEvent.change(field("phone"), { target: { value: "080" } });
    fireEvent.click(screen.getByRole("button", { name: s("discard") }));
    expect(field("phone")).toHaveValue("090-0000-0000");
    expect(screen.queryByText(unsaved(1))).not.toBeInTheDocument();
  });

  it("gives focus back to the edited field when Discard closes the bar", async () => {
    // The bar unmounts with the focused button inside it, which would drop a
    // keyboard user's focus to <body>, back at the top of the page.
    await renderPage();
    field("phone").focus();
    fireEvent.change(field("phone"), { target: { value: "080" } });
    const discard = screen.getByRole("button", { name: s("discard") });
    discard.focus();
    fireEvent.click(discard);
    expect(document.activeElement).toBe(field("phone"));
  });

  it("gives focus back to the edited field after a save from the bar", async () => {
    await renderPage();
    field("hobbies").focus();
    fireEvent.change(field("hobbies"), { target: { value: "登山" } });
    saveButton().focus();
    await save();
    expect(document.activeElement).toBe(field("hobbies"));
  });

  it("falls back to the form when the edited field is gone", async () => {
    // Discard remounts the extras card, so the commute box focused before is
    // no longer in the page.
    await renderPage(me({ commute_time: "約45分" }));
    const commute = screen.getByRole("textbox", { name: s("commuteTime") });
    commute.focus();
    fireEvent.change(commute, { target: { value: "約1時間" } });
    const discard = screen.getByRole("button", { name: s("discard") });
    discard.focus();
    fireEvent.click(discard);
    expect(document.activeElement).toBe(field("phone").form);
  });

  it("keeps what was typed while a save was on its way", async () => {
    // The save used to settle the form to the values it sent, overwriting
    // anything typed while the request was out, with no bar left to say so.
    const pending = { finish: () => {} };
    updateProfile.current = {
      ...updateProfile.current,
      mutateAsync: (update: unknown) => {
        updateProfile.saves.push(update);
        return new Promise<void>((resolve) => {
          pending.finish = resolve;
        });
      },
    };
    await renderPage();
    fireEvent.change(field("phone"), { target: { value: "080" } });
    await save();
    fireEvent.change(field("hobbies"), { target: { value: "登山" } });
    await act(async () => {
      pending.finish();
    });
    expect(updateProfile.saves).toEqual([{ phone_number: "080" }]);
    expect(field("hobbies")).toHaveValue("登山");
    expect(field("phone")).toHaveValue("080");
    expect(screen.getByText(unsaved(1))).toBeInTheDocument();
  });

  it.each([
    ["dateOfBirth", COMPLETE_PROFILE.date_of_birth],
    ["yearsExp", "5"],
  ] as Array<[Parameters<typeof s>[0], string]>)(
    "treats emptying %s as no change, and puts it back on leaving",
    async (labelKey, savedValue) => {
      // The backend can't empty these, so the outline and the save bar both
      // stay off, and the box doesn't pretend the value was removed.
      await renderPage();
      fireEvent.change(field(labelKey), { target: { value: "" } });
      expect(field(labelKey).className).not.toContain("border-indigo");
      expect(screen.queryByRole("button", { name: common("saveChanges") })).not.toBeInTheDocument();
      fireEvent.blur(field(labelKey));
      expect(field(labelKey)).toHaveValue(
        labelKey === "yearsExp" ? Number(savedValue) : savedValue,
      );
    },
  );

  it("shows the years error in the language picked afterwards", async () => {
    await renderPage();
    fireEvent.change(field("yearsExp"), { target: { value: "81" } });
    await act(async () => {
      fireEvent.submit(field("yearsExp").form as HTMLFormElement);
    });
    fireEvent.click(screen.getByRole("button", { name: /English/ }));
    expect(screen.getByText(t("settings", "yearsRange", "en"))).toBeInTheDocument();
  });

  it("stops an impossible number of years before it is sent", async () => {
    // The input's own max makes the form invalid, so the browser blocks it.
    await renderPage();
    fireEvent.change(field("yearsExp"), { target: { value: "81" } });
    await save();
    expect(field("yearsExp").validity.rangeOverflow).toBe(true);
    expect(updateProfile.saves).toEqual([]);
    // The zod check would also stop the save, so the proof that the input's
    // own max stopped it first is that zod's message never appeared.
    expect(screen.queryByText(s("yearsRange"))).not.toBeInTheDocument();
  });

  it("still refuses it if the form is submitted past that", async () => {
    // The zod rule behind the input's max, reachable only by submitting the
    // form directly.
    await renderPage();
    fireEvent.change(field("yearsExp"), { target: { value: "81" } });
    await act(async () => {
      fireEvent.submit(field("yearsExp").form as HTMLFormElement);
    });
    expect(updateProfile.saves).toEqual([]);
    expect(screen.getByText(s("yearsRange"))).toBeInTheDocument();
  });

  it("saves once the number is possible, and drops the error", async () => {
    await renderPage();
    fireEvent.change(field("yearsExp"), { target: { value: "81" } });
    await act(async () => {
      fireEvent.submit(field("yearsExp").form as HTMLFormElement);
    });
    fireEvent.change(field("yearsExp"), { target: { value: "8" } });
    expect(screen.queryByText(s("yearsRange"))).not.toBeInTheDocument();
    await save();
    expect(updateProfile.saves).toEqual([{ years_experience: 8 }]);
  });

  it("keeps the edits and says why when a save fails", async () => {
    updateProfile.current = {
      ...updateProfile.current,
      mutateAsync: () => Promise.reject(new ApiClientError(500, "boom")),
    };
    await renderPage();
    fireEvent.change(field("nameKana"), { target: { value: "すずき はなこ" } });
    await save();

    expect(screen.getByRole("alert")).toHaveTextContent(common("errorServer"));
    expect(toasts.list).toEqual([]);
    expect(field("nameKana")).toHaveValue("すずき はなこ");
    expect(screen.getByText(unsaved(1))).toBeInTheDocument();
  });

  it("explains a refused save in the reader's language", async () => {
    updateProfile.current = {
      ...updateProfile.current,
      mutateAsync: () => Promise.reject(new ApiClientError(422, "years_experience: invalid")),
    };
    await renderPage();
    fireEvent.change(field("phone"), { target: { value: "080" } });
    await save();

    expect(screen.getByRole("alert")).toHaveTextContent(common("errorInvalidInput"));
    expect(screen.getByRole("alert")).not.toHaveTextContent("years_experience");
  });

  it("shows a save in progress", async () => {
    updateProfile.current = { ...updateProfile.current, isPending: true };
    await renderPage();
    fireEvent.change(field("phone"), { target: { value: "080" } });
    expect(saveButton()).toHaveAttribute("aria-busy", "true");
  });

  it("clears a text field for real, and doesn't count emptying a date", async () => {
    await renderPage();
    fireEvent.change(field("address"), { target: { value: "" } });
    fireEvent.change(field("dateOfBirth"), { target: { value: "" } });
    await save();
    expect(updateProfile.saves).toEqual([{ mailing_address: "" }]);
  });
});

describe("settings page, the fields", () => {
  it("shows the email read-only and never sends it", async () => {
    await renderPage();
    const email = field("email");
    expect(email).toHaveValue("taro@example.test");
    expect(email).toHaveAttribute("readonly");
  });

  it("doesn't count the app language as an unsaved change", async () => {
    await renderPage();
    // Switching to English re-renders the page in English, so look for the
    // unsaved-changes line in either language.
    fireEvent.click(screen.getByRole("button", { name: /English/ }));
    expect(screen.queryByText(/unsaved change|未保存の変更/)).not.toBeInTheDocument();
  });

  it("adds a target role as a chip and sends the list", async () => {
    await renderPage();
    const roles = screen.getByRole("textbox", { name: s("targetRoles") });
    fireEvent.change(roles, { target: { value: "SRE" } });
    fireEvent.keyDown(roles, { key: "Enter" });
    await save();
    expect(updateProfile.saves).toEqual([{ target_role: ["SRE"] }]);
  });

  it("clears commute time when its switch goes off", async () => {
    await renderPage(me({ commute_time: "約45分" }));
    const toggle = screen.getByRole("switch", { name: s("showCommute") });
    expect(toggle).toHaveAttribute("aria-checked", "true");
    fireEvent.click(toggle);
    await save();
    expect(updateProfile.saves).toEqual([{ commute_time: "" }]);
  });

  it("describes each 履歴書 switch and its box", async () => {
    await renderPage(me({ commute_time: "約45分" }));
    expect(screen.getByRole("textbox", { name: s("commuteTime") })).toHaveAccessibleDescription(
      s("commuteExample"),
    );
    expect(screen.getByRole("switch", { name: s("showDependents") })).toHaveAccessibleDescription(
      s("dependentsOff"),
    );
  });

  it("offers the app language, not a preferred-language setting", async () => {
    await renderPage();
    expect(screen.getByText(s("appLanguage"))).toBeInTheDocument();
    // The old setting was a <select> of languages; the only selects left are
    // gender and JLPT level.
    const selects = screen.getAllByRole("combobox");
    expect(selects).toHaveLength(2);
    for (const select of selects) {
      expect(within(select).queryByRole("option", { name: /English/ })).not.toBeInTheDocument();
    }
  });
});

describe("settings page, deleting the account", () => {
  async function openConfirm() {
    await renderPage();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: s("deleteBtn") }));
    });
  }
  const phraseBox = () => screen.getByPlaceholderText(s("confirmPhrase"));
  const confirmButton = () => screen.getByRole("button", { name: s("confirmDeletion") });

  it("asks for a typed confirmation first", async () => {
    await openConfirm();
    expect(confirmButton()).toBeDisabled();
  });

  it("will not delete on the wrong phrase", async () => {
    await openConfirm();
    fireEvent.change(phraseBox(), { target: { value: "delete" } });
    expect(confirmButton()).toBeDisabled();
  });

  it("accepts the phrase whatever case it is typed in", async () => {
    // English on purpose: the Japanese phrase has no letter case.
    const phrase = t("settings", "confirmPhrase", "en");
    expect(phrase.toUpperCase()).not.toBe(phrase);
    meQuery.current = { data: me(), isLoading: false, error: null };
    await act(async () => {
      renderIn("en", <SettingsPage />);
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: t("settings", "deleteBtn", "en") }));
    });
    fireEvent.change(screen.getByPlaceholderText(phrase), {
      target: { value: phrase.toUpperCase() },
    });
    expect(
      screen.getByRole("button", { name: t("settings", "confirmDeletion", "en") }),
    ).not.toBeDisabled();
  });

  it("deletes, signs out and leaves for the sign-in page", async () => {
    await openConfirm();
    fireEvent.change(phraseBox(), { target: { value: s("confirmPhrase") } });
    await act(async () => {
      fireEvent.click(confirmButton());
    });
    expect(deleteAccount.calls).toBe(1);
    expect(session.signOuts).toBe(1);
    expect(session.pushes).toEqual([SIGN_IN_ROUTE]);
  });

  it("keeps the reader signed in when the deletion fails", async () => {
    deleteAccount.current = {
      mutateAsync: () => {
        deleteAccount.calls += 1;
        return Promise.reject(new ApiClientError(500, "boom"));
      },
      isPending: false,
      error: new ApiClientError(500, "boom"),
    };
    await openConfirm();
    fireEvent.change(phraseBox(), { target: { value: s("confirmPhrase") } });
    await act(async () => {
      fireEvent.click(confirmButton());
    });
    expect(deleteAccount.calls).toBe(1);
    expect(session.signOuts).toBe(0);
    expect(session.pushes).toEqual([]);
    expect(screen.getByRole("alert")).toHaveTextContent(common("errorServer"));
  });

  it("still leaves for sign-in when signing out fails after the delete", async () => {
    session.signOutFails = true;
    await openConfirm();
    fireEvent.change(phraseBox(), { target: { value: s("confirmPhrase") } });
    await act(async () => {
      fireEvent.click(confirmButton());
    });
    expect(session.pushes).toEqual([SIGN_IN_ROUTE]);
  });

  it("puts the confirmation away again on cancel", async () => {
    await openConfirm();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: common("cancel") }));
    });
    expect(screen.queryByPlaceholderText(s("confirmPhrase"))).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: s("deleteBtn") })).toBeInTheDocument();
  });
});

describe("settings page, before the profile arrives", () => {
  it("shows a skeleton rather than an empty form", async () => {
    const { container } = await renderPage(null, { isLoading: true });
    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
    expect(screen.queryByText(s("rirekishoReady"))).not.toBeInTheDocument();
  });

  it("says why when the profile can't be loaded", async () => {
    await renderPage(null, { error: new ApiClientError(500, "boom") });
    expect(screen.getByRole("alert")).toHaveTextContent(common("errorServer"));
  });
});

describe("settings page, structure", () => {
  it("has one h1 and a titled section per card", async () => {
    await renderPage();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    for (const key of [
      "profile",
      "sectionVisa",
      "sectionExtras",
      "sectionCareer",
      "sectionAccount",
    ]) {
      expect(screen.getByRole("heading", { level: 2, name: s(key) })).toBeInTheDocument();
    }
    expect(
      within(screen.getByRole("region", { name: s("profile") })).getByLabelText(s("email")),
    ).toBeInTheDocument();
  });
});

describe("settings page, the section menu", () => {
  it("marks the last section once the page is scrolled to the bottom", async () => {
    // Account is the last card, and the delete card below it ends the page
    // before Account can scroll up into the band the observer watches. So
    // without a bottom-of-page rule the menu stays on Career there.
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        observe() {}
        disconnect() {}
      },
    );
    const root = document.documentElement;
    const own = {
      scrollHeight: Object.getOwnPropertyDescriptor(root, "scrollHeight"),
      scrollY: Object.getOwnPropertyDescriptor(window, "scrollY"),
    };
    Object.defineProperty(root, "scrollHeight", { configurable: true, value: 2000 });
    Object.defineProperty(window, "scrollY", {
      configurable: true,
      value: 2000 - window.innerHeight,
    });
    try {
      await renderPage();
      act(() => {
        window.dispatchEvent(new Event("scroll"));
      });
      const nav = screen.getByRole("navigation", { name: s("sectionsNav") });
      expect(within(nav).getByRole("link", { name: s("sectionAccount") })).toHaveAttribute(
        "aria-current",
        "true",
      );
    } finally {
      vi.unstubAllGlobals();
      // Put back jsdom's own properties, or remove the stand-ins if there were none.
      if (own.scrollHeight) Object.defineProperty(root, "scrollHeight", own.scrollHeight);
      else delete (root as unknown as Record<string, unknown>)["scrollHeight"];
      if (own.scrollY) Object.defineProperty(window, "scrollY", own.scrollY);
      else delete (window as unknown as Record<string, unknown>)["scrollY"];
    }
  });

  it("scrolls the chip row to keep the current section's chip in view", async () => {
    // On a phone the five chips overflow their row, so a current section near
    // the end (Career, Account) would be highlighted off-screen. jsdom has no
    // layout, so the widths and offsets are stood in for here.
    const scrolls: ScrollToOptions[] = [];
    const layout = {
      scrollWidth: { get: () => 600 },
      clientWidth: { get: () => 375 },
      offsetWidth: { get: () => 100 },
      offsetLeft: {
        get(this: HTMLElement) {
          const i = ["#profile", "#visa", "#extras", "#career", "#account"].indexOf(
            this.getAttribute("href") ?? "",
          );
          return i < 0 ? 0 : i * 110;
        },
      },
    };
    const saved = Object.fromEntries(
      Object.keys(layout).map((key) => [
        key,
        Object.getOwnPropertyDescriptor(HTMLElement.prototype, key),
      ]),
    );
    for (const [key, getter] of Object.entries(layout)) {
      Object.defineProperty(HTMLElement.prototype, key, { configurable: true, ...getter });
    }
    const ownScrollTo = Object.getOwnPropertyDescriptor(Element.prototype, "scrollTo");
    const scrollTo = vi.fn((options: ScrollToOptions) => scrolls.push(options));
    Element.prototype.scrollTo = scrollTo as unknown as typeof Element.prototype.scrollTo;
    try {
      await renderPage();
      const nav = screen.getByRole("navigation", { name: s("sectionsNav") });
      fireEvent.click(within(nav).getByRole("link", { name: s("sectionCareer") }));
      // Career's chip starts at 330 and is 100 wide: centred in a 375 row, the
      // row scrolls to 330 - (375 - 100) / 2.
      expect(scrolls.at(-1)).toMatchObject({ left: 330 - (375 - 100) / 2 });
    } finally {
      for (const [key, descriptor] of Object.entries(saved)) {
        // Put back jsdom's own property, or remove the stand-in if there was none.
        if (descriptor) Object.defineProperty(HTMLElement.prototype, key, descriptor);
        else delete (HTMLElement.prototype as unknown as Record<string, unknown>)[key];
      }
      if (ownScrollTo) Object.defineProperty(Element.prototype, "scrollTo", ownScrollTo);
      else delete (Element.prototype as unknown as Record<string, unknown>)["scrollTo"];
    }
  });

  it("lists the five sections, the first one current", async () => {
    await renderPage();
    const nav = screen.getByRole("navigation", { name: s("sectionsNav") });
    const links = within(nav).getAllByRole("link");
    expect(links.map((a) => a.getAttribute("href"))).toEqual([
      "#profile",
      "#visa",
      "#extras",
      "#career",
      "#account",
    ]);
    expect(links[0]).toHaveAttribute("aria-current", "true");
  });

  it("marks the section a reader jumps to", async () => {
    await renderPage();
    const nav = screen.getByRole("navigation", { name: s("sectionsNav") });
    fireEvent.click(within(nav).getByRole("link", { name: s("sectionCareer") }));
    expect(within(nav).getByRole("link", { name: s("sectionCareer") })).toHaveAttribute(
      "aria-current",
      "true",
    );
  });
});

describe("settings page, leaving with unsaved changes", () => {
  function beforeUnloadIsBlocked(): boolean {
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  }

  /** A link elsewhere in the app, as the sidebar would render. */
  function outsideLink(href = "/dashboard/jobs"): HTMLAnchorElement {
    const a = document.createElement("a");
    a.href = href;
    a.textContent = "Jobs";
    a.dataset["testLink"] = "";
    document.body.appendChild(a);
    return a;
  }

  it("asks the browser to confirm closing only while there are edits", async () => {
    await renderPage();
    expect(beforeUnloadIsBlocked()).toBe(false);
    fireEvent.change(field("phone"), { target: { value: "080" } });
    expect(beforeUnloadIsBlocked()).toBe(true);
  });

  it("asks before following a link, and stays on Keep editing", async () => {
    await renderPage();
    fireEvent.change(field("phone"), { target: { value: "080" } });
    confirm.answer = false;
    await act(async () => {
      fireEvent.click(outsideLink());
    });
    expect(confirm.calls).toBe(1);
    expect(session.pushes).toEqual([]);
  });

  it("follows the link on Discard", async () => {
    await renderPage();
    fireEvent.change(field("phone"), { target: { value: "080" } });
    await act(async () => {
      fireEvent.click(outsideLink());
    });
    expect(session.pushes).toEqual(["/dashboard/jobs"]);
  });

  it("doesn't ask for a link to this same page", async () => {
    // The sidebar's own Settings link: following it would keep the edits
    // anyway, so a "Discard" answer would have done nothing.
    await renderPage();
    fireEvent.change(field("phone"), { target: { value: "080" } });
    await act(async () => {
      fireEvent.click(outsideLink(window.location.pathname));
    });
    expect(confirm.calls).toBe(0);
  });

  it("doesn't ask for the section menu's own jumps", async () => {
    await renderPage();
    fireEvent.change(field("phone"), { target: { value: "080" } });
    const nav = screen.getByRole("navigation", { name: s("sectionsNav") });
    fireEvent.click(within(nav).getByRole("link", { name: s("sectionCareer") }));
    expect(confirm.calls).toBe(0);
  });
});
