import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, screen, type RenderResult } from "@testing-library/react";
import { renderIn } from "../helpers";
import { ApiClientError } from "@/lib/api-client";
import { t } from "@/lib/i18n";
import type { MeResponse, Profile, User } from "@/types/api";

const meQuery = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));
const updateProfile = vi.hoisted(() => ({
  current: {} as Record<string, unknown>,
  saves: [] as Record<string, unknown>[],
}));
const recordConsent = vi.hoisted(() => ({ current: {} as Record<string, unknown>, calls: 0 }));

vi.mock("@/hooks/useMe", () => ({
  useMe: () => meQuery.current,
  useUpdateProfile: () => updateProfile.current,
  useRecordConsent: () => recordConsent.current,
  useUploadPhoto: () => ({}),
}));

// One stable router object: the page's redirect effect lists `router` in its
// dependencies, so returning a fresh object per render would re-run the
// effect every render and double the recorded navigations -- a mock
// artefact that looks exactly like a redirect loop in the page.
const routerObject = vi.hoisted(() => ({
  push: (url: string) => routerObject.pushes.push(url),
  replace: (url: string) => routerObject.replaces.push(url),
  pushes: [] as string[],
  replaces: [] as string[],
}));

vi.mock("next/navigation", () => ({ useRouter: () => routerObject }));

vi.mock("@/components/profile/PhotoUploader", () => ({ PhotoUploader: () => null }));

const OnboardingPage = (await import("@/app/onboarding/page")).default;

const LANG = "ja";
const o = (key: Parameters<typeof t>[1]) => t("onboarding", key, LANG);
const common = (key: Parameters<typeof t>[1]) => t("common", key, LANG);

const PROFILE: Profile = {
  id: "p1",
  user_id: "u1",
  nationality: "",
  japanese_level: "none",
  target_industry: [],
  target_role: [],
  years_experience: null,
  current_location: null,
  target_location: null,
  visa_status: "none",
  preferred_language: "id",
  onboarding_step: 0,
  onboarding_completed: false,
  consent_given_at: null,
  name_kana: null,
  date_of_birth: null,
  gender: null,
  phone_number: null,
  mailing_address: null,
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
  email: "budi@example.test",
  email_verified: true,
  full_name: null,
  subscription_tier: "free",
  role: "user",
  is_active: true,
  last_login_at: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  profile: null,
};

function me(profileOver: Partial<Profile> = {}, userOver: Partial<User> = {}): MeResponse {
  const profile = { ...PROFILE, ...profileOver };
  return {
    user: { ...USER, ...userOver, profile },
    profile,
    rirekisho_ready: false,
    rirekisho_missing_fields: [],
  };
}

async function renderPage(data: MeResponse | undefined = me()): Promise<RenderResult> {
  meQuery.current = { data, isLoading: false };
  let view: RenderResult | null = null;
  await act(async () => {
    view = renderIn(LANG, <OnboardingPage />);
  });
  if (view === null) throw new Error("the page never rendered");
  return view as RenderResult;
}

/** The "Step n of 5" line, which is how the wizard says where it is. */
function stepLine(n: number): string {
  return o("stepOf").replace("{n}", String(n)).replace("{t}", "5");
}

async function submit(container: HTMLElement) {
  await act(async () => {
    fireEvent.submit(container.querySelector("form") as HTMLFormElement);
  });
}

beforeEach(() => {
  updateProfile.saves = [];
  updateProfile.current = {
    mutateAsync: (form: Record<string, unknown>) => {
      updateProfile.saves.push(form);
      return Promise.resolve();
    },
    isPending: false,
  };
  recordConsent.calls = 0;
  recordConsent.current = {
    mutateAsync: () => {
      recordConsent.calls += 1;
      return Promise.resolve();
    },
    isPending: false,
  };
  routerObject.pushes = [];
  routerObject.replaces = [];
});

describe("onboarding, where a returning user lands", () => {
  // onboarding_step is not the wizard step: step 2 saves 1, step 3 saves 2,
  // step 4 saves 4 (skipping 3), step 5 saves 5. This maps a saved value to
  // the wizard step that comes after it, and getting it wrong sends someone
  // back through questions they already answered.
  it.each([
    [0, 1],
    [1, 3],
    [2, 4],
    [3, 4],
    [4, 5],
    [5, 5],
  ])("resumes at wizard step %i -> %i", async (saved, expected) => {
    await renderPage(me({ onboarding_step: saved }, { full_name: "Budi Santoso" }));

    expect(screen.getByText(stepLine(expected))).toBeInTheDocument();
  });

  it("holds a user with no name at step 2 however far they got", async () => {
    // Step 2 is the only place full_name is captured. Letting them jump to
    // step 5 would complete onboarding with it still unset, and the redirect
    // guard would then lock them out of the only screen that asks for it.
    await renderPage(me({ onboarding_step: 4 }, { full_name: null }));

    expect(screen.getByText(stepLine(2))).toBeInTheDocument();
  });

  it("does not hold back a user who has a name", async () => {
    await renderPage(me({ onboarding_step: 4 }, { full_name: "Budi Santoso" }));

    expect(screen.getByText(stepLine(5))).toBeInTheDocument();
  });

  it("sends a finished user to the dashboard", async () => {
    await renderPage(me({ onboarding_step: 5, onboarding_completed: true }));

    expect(routerObject.replaces).toEqual(["/dashboard/resumes"]);
  });

  it("leaves an unfinished user alone", async () => {
    await renderPage(me({ onboarding_step: 2 }, { full_name: "Budi Santoso" }));

    expect(routerObject.replaces).toEqual([]);
  });

  it("starts at step 1 before the profile has arrived", async () => {
    await renderPage(undefined);

    expect(screen.getByText(stepLine(1))).toBeInTheDocument();
  });
});

describe("onboarding, step 1 consent", () => {
  it("will not continue until the box is ticked", async () => {
    await renderPage();

    expect(screen.getByRole("button", { name: o("s1Btn") })).toBeDisabled();
  });

  it("records the consent and moves on", async () => {
    await renderPage();

    fireEvent.click(screen.getByRole("checkbox"));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: o("s1Btn") }));
    });

    expect(recordConsent.calls).toBe(1);
    expect(screen.getByText(stepLine(2))).toBeInTheDocument();
  });

  it("stays put and explains when recording it fails", async () => {
    recordConsent.current = {
      mutateAsync: () => Promise.reject(new ApiClientError(500, "boom")),
      isPending: false,
    };
    await renderPage();

    fireEvent.click(screen.getByRole("checkbox"));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: o("s1Btn") }));
    });

    expect(screen.getByRole("alert")).toHaveTextContent(common("errorServer"));
    expect(screen.getByText(stepLine(1))).toBeInTheDocument();
  });
});

describe("onboarding, the steps that save", () => {
  /** Tick consent and land on step 2. */
  async function toStep2() {
    const view = await renderPage();
    fireEvent.click(screen.getByRole("checkbox"));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: o("s1Btn") }));
    });
    return view;
  }

  it("will not save a nameless profile", async () => {
    const { container } = await toStep2();

    await submit(container);

    expect(updateProfile.saves).toEqual([]);
    expect(screen.getByText("Name is required")).toBeInTheDocument();
  });

  it("saves the name against onboarding_step 1, not 2", async () => {
    // The saved value trails the wizard step; the resume mapping above
    // depends on exactly these numbers.
    const { container } = await toStep2();

    fireEvent.change(screen.getByLabelText(new RegExp(o("s2Name"))), {
      target: { value: "Budi Santoso" },
    });
    await submit(container);

    expect(updateProfile.saves[0]).toMatchObject({
      full_name: "Budi Santoso",
      preferred_language: "id",
      onboarding_step: 1,
    });
    expect(screen.getByText(stepLine(3))).toBeInTheDocument();
  });

  it("goes back from step 2 to consent", async () => {
    await toStep2();

    fireEvent.click(screen.getByRole("button", { name: common("back") }));

    expect(screen.getByText(stepLine(1))).toBeInTheDocument();
  });

  /** Walk to step 3 with the name filled in. */
  async function toStep3() {
    const view = await toStep2();
    fireEvent.change(screen.getByLabelText(new RegExp(o("s2Name"))), {
      target: { value: "Budi Santoso" },
    });
    await submit(view.container);
    return view;
  }

  it("saves the background against onboarding_step 2, not 3", async () => {
    const { container } = await toStep3();

    fireEvent.change(screen.getByLabelText(new RegExp(o("s3Nation"))), {
      target: { value: "Indonesia" },
    });
    fireEvent.change(screen.getByLabelText(new RegExp(o("s3CurrLoc"))), {
      target: { value: "Jakarta" },
    });
    fireEvent.change(screen.getByLabelText(new RegExp(o("s3TargLoc"))), {
      target: { value: "Tokyo" },
    });
    fireEvent.change(screen.getByLabelText(new RegExp(o("s3ExpYears"))), {
      target: { value: "5" },
    });
    await submit(container);

    expect(updateProfile.saves[1]).toMatchObject({
      nationality: "Indonesia",
      current_location: "Jakarta",
      target_location: "Tokyo",
      years_experience: 5,
      onboarding_step: 2,
    });
    expect(screen.getByText(stepLine(4))).toBeInTheDocument();
  });

  /** Walk to step 4. */
  async function toStep4() {
    const view = await toStep3();
    for (const [key, value] of [
      ["s3Nation", "Indonesia"],
      ["s3CurrLoc", "Jakarta"],
      ["s3TargLoc", "Tokyo"],
      ["s3ExpYears", "5"],
    ] as Array<[Parameters<typeof o>[0], string]>) {
      fireEvent.change(screen.getByLabelText(new RegExp(o(key))), { target: { value } });
    }
    await submit(view.container);
    return view;
  }

  it("saves preferences against onboarding_step 4, skipping 3 entirely", async () => {
    const { container } = await toStep4();

    fireEvent.change(screen.getByLabelText(new RegExp(o("s4Industries"))), {
      target: { value: " IT , Finance ,, " },
    });
    fireEvent.change(screen.getByLabelText(new RegExp(o("s4Roles"))), {
      target: { value: "Backend Engineer" },
    });
    await submit(container);

    expect(updateProfile.saves[2]).toMatchObject({
      target_industry: ["IT", "Finance"],
      target_role: ["Backend Engineer"],
      onboarding_step: 4,
    });
    expect(screen.getByText(stepLine(5))).toBeInTheDocument();
  });

  it("will not save empty preference lists", async () => {
    const { container } = await toStep4();

    await submit(container);

    expect(updateProfile.saves).toHaveLength(2);
    expect(screen.getByText("Enter at least one industry")).toBeInTheDocument();
  });

  it("explains a save that fails and stays on the step", async () => {
    // Set before rendering, not swapped in afterwards: the step's submit
    // handler closes over the mutation object from its last render, so a
    // mid-test replacement is never seen and the save quietly succeeds.
    updateProfile.current = {
      mutateAsync: () => Promise.reject(new ApiClientError(503, "down")),
      isPending: false,
    };
    const view = await toStep2();

    fireEvent.change(screen.getByLabelText(new RegExp(o("s2Name"))), {
      target: { value: "Budi Santoso" },
    });
    await submit(view.container);

    // 503 has no message of its own; it falls through to the shared 5xx one.
    expect(screen.getByRole("alert")).toHaveTextContent(common("errorServer"));
    expect(screen.getByText(stepLine(2))).toBeInTheDocument();
  });
});

describe("onboarding, step 5 personal details", () => {
  /** Land directly on step 5, the way a returning user does. */
  async function toStep5(profileOver: Partial<Profile> = {}) {
    return renderPage(me({ onboarding_step: 4, ...profileOver }, { full_name: "Budi Santoso" }));
  }

  /**
   * Fill every field step 5 requires. getByLabelText, not queryByLabelText:
   * a silently skipped field would leave the form invalid and make the test
   * fail somewhere else entirely, saying nothing about the missing label.
   */
  function fillRequired() {
    for (const [key, value] of [
      ["s5NameKana", "やまだ たろう"],
      ["s5DateOfBirth", "1995-04-01"],
      ["s5Gender", "male"],
      ["s5Phone", "090-0000-0000"],
      ["s5Address", "東京都渋谷区1-1-1"],
      ["s5VisaExpiration", "2030-01-01"],
    ] as Array<[Parameters<typeof o>[0], string]>) {
      fireEvent.change(screen.getByLabelText(new RegExp(o(key))), { target: { value } });
    }
  }

  it("offers the standard personal-requests wording by default", async () => {
    // Every rirekisho says this; making people type it is pointless.
    await toStep5();

    expect(screen.getByDisplayValue("貴社の規定に従います。")).toBeInTheDocument();
  });

  it("prefers what the profile already holds", async () => {
    await toStep5({ personal_requests: "リモート勤務を希望します。" });

    expect(screen.getByDisplayValue("リモート勤務を希望します。")).toBeInTheDocument();
  });

  it("asks for a visa category only from someone holding a visa", async () => {
    const { container } = await toStep5({ visa_status: "held" });

    fillRequired();
    await submit(container);

    expect(updateProfile.saves).toEqual([]);
    expect(screen.getByText("Visa category is required")).toBeInTheDocument();
  });

  it("does not ask someone without a visa for its category", async () => {
    const { container } = await toStep5({ visa_status: "none" });

    fillRequired();
    await submit(container);

    expect(updateProfile.saves).toHaveLength(1);
    expect(updateProfile.saves[0]).not.toHaveProperty("visa_category");
  });

  it("finishes onboarding and leaves for the dashboard", async () => {
    const { container } = await toStep5();

    fillRequired();
    await submit(container);

    expect(updateProfile.saves[0]).toMatchObject({ onboarding_step: 5 });
    expect(routerObject.pushes).toEqual(["/dashboard/resumes"]);
  });

  it("stays put when the last save fails", async () => {
    updateProfile.current = {
      mutateAsync: () => Promise.reject(new ApiClientError(500, "boom")),
      isPending: false,
    };
    const { container } = await toStep5();

    fillRequired();
    await submit(container);

    expect(routerObject.pushes).toEqual([]);
    expect(screen.getByRole("alert")).toHaveTextContent(common("errorServer"));
  });

  it("goes back to step 4", async () => {
    await toStep5();

    fireEvent.click(screen.getByRole("button", { name: common("back") }));

    expect(screen.getByText(stepLine(4))).toBeInTheDocument();
  });
});
