import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, screen, type RenderResult } from "@testing-library/react";
import { renderIn } from "../helpers";
import { ApiClientError } from "@/lib/api-client";
import { t } from "@/lib/i18n";
import { SIGN_IN_ROUTE } from "@/lib/routes";
import type { MeResponse, Profile, User, VisaStatus } from "@/types/api";

// jsdom has no layout, so the missing-field links' scroll-into-view would
// throw the moment one is clicked.
Element.prototype.scrollIntoView = vi.fn();

const meQuery = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));
const updateProfile = vi.hoisted(() => ({
  current: {} as Record<string, unknown>,
  saves: [] as unknown[],
}));
const deleteAccount = vi.hoisted(() => ({
  current: {} as Record<string, unknown>,
  calls: 0,
}));
const session = vi.hoisted(() => ({ signOuts: 0, pushes: [] as string[] }));

vi.mock("@/hooks/useMe", () => ({
  useMe: () => meQuery.current,
  useUpdateProfile: () => updateProfile.current,
  useUploadPhoto: () => ({}),
}));

vi.mock("@/hooks/useAccount", () => ({ useDeleteAccount: () => deleteAccount.current }));

vi.mock("@clerk/nextjs", () => ({
  useClerk: () => ({
    signOut: () => {
      session.signOuts += 1;
      return Promise.resolve();
    },
  }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: (url: string) => session.pushes.push(url) }),
}));

// Pulls in react-dropzone and the photo upload hook, neither of which this
// page's own behaviour depends on.
vi.mock("@/components/profile/PhotoUploader", () => ({ PhotoUploader: () => null }));

const SettingsPage = (await import("@/app/dashboard/settings/page")).default;

const LANG = "ja";
const s = (key: Parameters<typeof t>[1]) => t("settings", key, LANG);
const common = (key: Parameters<typeof t>[1]) => t("common", key, LANG);

/**
 * A "YYYY-MM-DD" birth date for someone who turns `years` old today, or
 * `plusDays` later. Computed rather than hardcoded so the age-boundary
 * tests below don't start failing on a particular date.
 */
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

async function renderPage(
  data: MeResponse | undefined = me(),
  over: Record<string, unknown> = {},
): Promise<RenderResult> {
  meQuery.current = { data, isLoading: false, ...over };
  let view: RenderResult | null = null;
  await act(async () => {
    view = renderIn(LANG, <SettingsPage />);
  });
  if (view === null) throw new Error("the page never rendered");
  return view as RenderResult;
}

/** The count line, e.g. "3 of 6 required fields are missing". */
function missingCountText(missing: number, total: number): string {
  return s("rirekishoMissingCount").replace("{n}", String(missing)).replace("{m}", String(total));
}

beforeEach(() => {
  updateProfile.saves = [];
  updateProfile.current = {
    mutateAsync: (form: unknown) => {
      updateProfile.saves.push(form);
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
});

describe("settings page, the rirekisho completeness banner", () => {
  it("says so when nothing is missing", async () => {
    await renderPage();

    expect(screen.getByText(s("rirekishoReady"))).toBeInTheDocument();
  });

  it("counts what is missing against what is required", async () => {
    await renderPage(me({ phone_number: null, mailing_address: null }));

    expect(screen.getByText(missingCountText(2, 6))).toBeInTheDocument();
  });

  it("names each missing field", async () => {
    await renderPage(me({ phone_number: null, name_kana: null }));

    expect(screen.getByRole("button", { name: s("phone") })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: s("nameKana") })).toBeInTheDocument();
  });

  it.each([
    ["full_name", "fullName"],
    ["name_kana", "nameKana"],
    ["gender", "gender"],
    ["phone_number", "phone"],
    ["mailing_address", "address"],
  ] as Array<[string, Parameters<typeof s>[0]]>)("counts a missing %s", async (field, labelKey) => {
    // One case per required field: without gender here, deleting its arm
    // from isFieldMissing passed the whole suite.
    await renderPage(field === "full_name" ? me({}, { full_name: null }) : me({ [field]: null }));

    expect(screen.getByText(missingCountText(1, 6))).toBeInTheDocument();
    expect(screen.getByRole("button", { name: s(labelKey) })).toBeInTheDocument();
  });

  it("moves focus to the field a reader picks from the list", async () => {
    await renderPage(me({ phone_number: null }));

    fireEvent.click(screen.getByRole("button", { name: s("phone") }));

    expect(document.activeElement).toBe(document.getElementById("rirekisho-field-phone_number"));
  });

  it("takes the name from the account, not the profile", async () => {
    // full_name lives on the user rather than the profile, so it is the one
    // required field read from a different object.
    await renderPage(me({}, { full_name: null }));

    expect(screen.getByText(missingCountText(1, 6))).toBeInTheDocument();
    expect(screen.getByRole("button", { name: s("fullName") })).toBeInTheDocument();
  });
});

describe("settings page, the fields a held visa adds", () => {
  const HELD: Partial<Profile> = { visa_status: "held" };

  it("requires two more fields when a visa is held", async () => {
    await renderPage(me(HELD));

    expect(screen.getByText(missingCountText(2, 8))).toBeInTheDocument();
    expect(screen.getByRole("button", { name: s("visaCategory") })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: s("visaExpiration") })).toBeInTheDocument();
  });

  it("counts them as met once they are filled in", async () => {
    await renderPage(
      me({
        ...HELD,
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

    expect(screen.getByText(missingCountText(1, 6))).toBeInTheDocument();
    expect(screen.getByRole("button", { name: s("dateOfBirth") })).toBeInTheDocument();
  });

  it("accepts someone who turns 80 today", async () => {
    await renderPage(me({ date_of_birth: birthDateForAge(80) }));

    expect(screen.getByText(s("rirekishoReady"))).toBeInTheDocument();
  });

  it("rejects someone who turned 81 yesterday", async () => {
    await renderPage(me({ date_of_birth: birthDateForAge(81, -1) }));

    expect(screen.getByText(missingCountText(1, 6))).toBeInTheDocument();
    expect(screen.getByRole("button", { name: s("dateOfBirth") })).toBeInTheDocument();
  });

  it("rejects a date of birth that was never given", async () => {
    await renderPage(me({ date_of_birth: null }));

    expect(screen.getByText(missingCountText(1, 6))).toBeInTheDocument();
    expect(screen.getByRole("button", { name: s("dateOfBirth") })).toBeInTheDocument();
  });
});

describe("settings page, saving", () => {
  /**
   * The save button in the same form as `field`. Both sections render one,
   * so this anchors to the section under test rather than to form order.
   */
  function saveButtonFor(field: HTMLElement): HTMLElement {
    const form = (field as HTMLInputElement).form;
    if (!form) throw new Error("the field is not in a form");
    const button = form.querySelector('button[type="submit"]');
    if (!button) throw new Error("the form has no submit button");
    return button as HTMLElement;
  }

  it("stops an impossible number of years before it is sent", async () => {
    // What a reader actually hits: the input's own max, which makes the form
    // invalid so the browser blocks submission and shows its own message.
    await renderPage();
    const years = screen.getByLabelText(new RegExp(s("yearsExp"))) as HTMLInputElement;

    fireEvent.change(years, { target: { value: "81" } });
    await act(async () => {
      fireEvent.click(saveButtonFor(years));
    });

    expect(years.validity.rangeOverflow).toBe(true);
    expect(years.form?.checkValidity()).toBe(false);
    expect(updateProfile.saves).toEqual([]);
  });

  it("still refuses it if the form is submitted past that", async () => {
    // The zod schema behind the input's max. A click cannot reach this --
    // native validation stops the submit first, verified: rangeOverflow is
    // true and no save is recorded. Submitting the form directly is the only
    // way in, which is why this test does that and the one above does not.
    // It is worth keeping: without it, deleting the schema is invisible.
    await renderPage();
    const years = screen.getByLabelText(new RegExp(s("yearsExp"))) as HTMLInputElement;

    fireEvent.change(years, { target: { value: "81" } });
    await act(async () => {
      fireEvent.submit(years.form as HTMLFormElement);
    });

    expect(updateProfile.saves).toEqual([]);
    expect(screen.getByText("Must be 80 or less")).toBeInTheDocument();
  });

  it("saves once the number is possible", async () => {
    await renderPage();
    const years = screen.getByLabelText(new RegExp(s("yearsExp")));

    fireEvent.change(years, { target: { value: "8" } });
    await act(async () => {
      fireEvent.click(saveButtonFor(years));
    });

    expect(updateProfile.saves).toHaveLength(1);
    expect(updateProfile.saves[0]).toMatchObject({ years_experience: 8 });
  });

  it("says a save is in progress", async () => {
    updateProfile.current = { ...updateProfile.current, isPending: true };
    await renderPage();

    for (const button of screen.getAllByRole("button", { name: common("saving") })) {
      expect(button).toBeDisabled();
    }
  });

  it("explains a refused save in the reader's language", async () => {
    updateProfile.current = {
      ...updateProfile.current,
      error: new ApiClientError(422, "years_experience: invalid"),
    };
    await renderPage();

    // Both sections share the mutation, so both report it.
    for (const alert of screen.getAllByRole("alert")) {
      expect(alert).toHaveTextContent(common("errorInvalidInput"));
      expect(alert).not.toHaveTextContent("years_experience");
    }
  });

  it("confirms a save that worked", async () => {
    await renderPage();
    const years = screen.getByLabelText(new RegExp(s("yearsExp")));

    await act(async () => {
      fireEvent.click(saveButtonFor(years));
    });

    expect(screen.getByText(common("saved"))).toBeInTheDocument();
  });
});

describe("settings page, deleting the account", () => {
  async function openConfirm() {
    await renderPage();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: s("deleteBtn") }));
    });
  }

  it("asks for a typed confirmation first", async () => {
    await openConfirm();

    expect(screen.getByRole("button", { name: s("confirmDeletion") })).toBeDisabled();
  });

  it("will not delete on the wrong phrase", async () => {
    await openConfirm();

    fireEvent.change(screen.getByPlaceholderText(s("confirmPhrase")), {
      target: { value: "delete" },
    });

    expect(screen.getByRole("button", { name: s("confirmDeletion") })).toBeDisabled();
  });

  it("accepts the phrase whatever case it is typed in", async () => {
    // Rendered in English on purpose: the Japanese phrase has no letter case,
    // so toUpperCase() leaves it identical and the test would pass against a
    // strictly case-sensitive comparison. Proven -- with the page in "ja",
    // changing the page to a strict === still passed.
    const phrase = t("settings", "confirmPhrase", "en");
    expect(phrase.toUpperCase()).not.toBe(phrase);

    meQuery.current = { data: me(), isLoading: false };
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

    fireEvent.change(screen.getByPlaceholderText(s("confirmPhrase")), {
      target: { value: s("confirmPhrase") },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: s("confirmDeletion") }));
    });

    expect(deleteAccount.calls).toBe(1);
    expect(session.signOuts).toBe(1);
    expect(session.pushes).toEqual([SIGN_IN_ROUTE]);
  });

  it("keeps the reader signed in when the deletion fails", async () => {
    // The whole point of this branch: the account still exists, so signing
    // them out would strand them at sign-in with an account they still have.
    deleteAccount.current = {
      mutateAsync: () => {
        deleteAccount.calls += 1;
        return Promise.reject(new ApiClientError(500, "boom"));
      },
      isPending: false,
      error: new ApiClientError(500, "boom"),
    };
    await openConfirm();

    fireEvent.change(screen.getByPlaceholderText(s("confirmPhrase")), {
      target: { value: s("confirmPhrase") },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: s("confirmDeletion") }));
    });

    expect(deleteAccount.calls).toBe(1);
    expect(session.signOuts).toBe(0);
    expect(session.pushes).toEqual([]);
    expect(screen.getByRole("alert")).toHaveTextContent(common("errorServer"));
  });

  it("puts the confirmation away again on cancel", async () => {
    await openConfirm();

    fireEvent.change(screen.getByPlaceholderText(s("confirmPhrase")), {
      target: { value: s("confirmPhrase") },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: common("cancel") }));
    });

    expect(screen.queryByPlaceholderText(s("confirmPhrase"))).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: s("deleteBtn") })).toBeInTheDocument();
  });
});

describe("settings page, before the profile arrives", () => {
  it("shows a skeleton rather than an empty form", async () => {
    const { container } = await renderPage(undefined, { isLoading: true });

    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
    expect(screen.queryByText(s("rirekishoReady"))).not.toBeInTheDocument();
  });
});
