import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, screen } from "@testing-library/react";
import type { ComponentType } from "react";
import { renderIn } from "../helpers";
import { ApiClientError } from "@/lib/api-client";
import { t } from "@/lib/i18n";

/**
 * The two "new document" pages, from the wizard through to what happens
 * when the create request comes back.
 *
 * Both used to await the create without catching it. The wizard still showed
 * the failure -- it reads the mutation's error state -- but the rejection
 * also escaped as an unhandled one, and a refused create is easy to cause:
 * type a job posting id you can't see and the API answers 404. Vitest fails
 * the whole run on an unhandled rejection, which is what makes the failure
 * tests below a real guard rather than a restatement of the error branch.
 */

const create = vi.hoisted(() => ({
  current: {} as Record<string, unknown>,
  calls: [] as unknown[],
}));
const nav = vi.hoisted(() => ({ pushes: [] as string[], job: null as string | null }));

// One stable router: the pages' effects may list it as a dependency, and a
// fresh object per render re-runs them.
const router = vi.hoisted(() => ({ push: (url: string) => nav.pushes.push(url) }));

vi.mock("next/navigation", () => ({
  useRouter: () => router,
  useSearchParams: () => ({ get: (key: string) => (key === "job" ? nav.job : null) }),
}));
vi.mock("@/hooks/useDocuments", () => ({ useCreateDocument: () => create.current }));
vi.mock("@/hooks/useResumes", () => ({
  useResumes: () => ({
    data: {
      items: [
        {
          id: "r1",
          file_name: "cv.pdf",
          file_size_bytes: 1024,
          is_primary: true,
          created_at: "2026-09-01T00:00:00Z",
        },
      ],
      total: 1,
    },
    isLoading: false,
  }),
}));
// replaces the existing vi.mock("@/hooks/useMe", …)
const me = vi.hoisted(() => ({ current: {} as Record<string, unknown>, refetches: 0 }));
vi.mock("@/hooks/useMe", () => ({ useMe: () => me.current }));

const Rirekisho = (await import("@/app/dashboard/documents/rirekisho/new/page")).default;
const Shokumu = (await import("@/app/dashboard/documents/shokumu/new/page")).default;

const LANG = "ja";
const d = (key: Parameters<typeof t>[1]) => t("documents", key, LANG);
const JOB_ID = "2f1c5a3e-8b7d-4c21-9e0a-6d5b4f3c2a19";

const PAGES: Array<[string, ComponentType, Parameters<typeof t>[1]]> = [
  ["rirekisho", Rirekisho, "generateRirekisho"],
  ["shokumu", Shokumu, "generateShokumu"],
];

/** Pick the resume, step past the job id and submit. */
async function submitThroughWizard(submitKey: Parameters<typeof t>[1]) {
  fireEvent.click(screen.getByRole("radio"));
  fireEvent.click(screen.getByRole("button", { name: d("wizNext") }));
  fireEvent.click(screen.getByRole("button", { name: d("wizNext") }));
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: d(submitKey) }));
  });
}

beforeEach(() => {
  me.refetches = 0;
  me.current = {
    data: { rirekisho_ready: true, rirekisho_missing_fields: [] },
    isLoading: false,
    isFetching: false,
    refetch: () => {
      me.refetches += 1;
      return Promise.resolve();
    },
  };
  create.calls = [];
  nav.pushes = [];
  nav.job = null;
});

describe.each(PAGES)("the new %s page", (_name, Page, submitKey) => {
  it("stays put and explains a refused create", async () => {
    // Set before rendering: the submit handler closes over the mutation
    // object from its last render, so a later swap would never be seen.
    create.current = {
      mutateAsync: () => Promise.reject(new ApiClientError(404, "Job posting not found")),
      isPending: false,
      error: new ApiClientError(404, "Job posting not found"),
    };
    nav.job = JOB_ID;
    await act(async () => {
      renderIn(LANG, <Page />);
    });

    await submitThroughWizard(submitKey);

    expect(screen.getByRole("alert")).toHaveTextContent(t("common", "errorNotFound", LANG));
    expect(nav.pushes).toEqual([]);
  });

  it("opens the new document once it is created", async () => {
    create.current = {
      mutateAsync: (vars: unknown) => {
        create.calls.push(vars);
        return Promise.resolve({ id: "doc-1" });
      },
      isPending: false,
      error: null,
    };
    await act(async () => {
      renderIn(LANG, <Page />);
    });

    await submitThroughWizard(submitKey);

    expect(nav.pushes).toEqual(["/dashboard/documents/doc-1"]);
  });

  it("sends the posting from a job page's link with the request", async () => {
    // The jobs page links here with ?job=<id>. That id reaching the create
    // request is the whole of the tailoring feature on this side.
    create.current = {
      mutateAsync: (vars: unknown) => {
        create.calls.push(vars);
        return Promise.resolve({ id: "doc-1" });
      },
      isPending: false,
      error: null,
    };
    nav.job = JOB_ID;
    await act(async () => {
      renderIn(LANG, <Page />);
    });

    await submitThroughWizard(submitKey);

    expect(create.calls[0]).toMatchObject({ resume_id: "r1", job_posting_id: JOB_ID });
  });
});

describe("the new 履歴書 page, before the profile is ready", () => {
  it("lists what is missing in the reader's language, and links to the profile", async () => {
    me.current = {
      ...me.current,
      data: {
        rirekisho_ready: false,
        rirekisho_missing_fields: [{ key: "phone_number", label: "Phone number" }],
      },
    };
    await act(async () => {
      renderIn(LANG, <Rirekisho />);
    });
    expect(screen.getByText(t("settings", "phone", LANG))).toBeInTheDocument();
    expect(screen.queryByText("Phone number")).not.toBeInTheDocument();
    // The Settings page's cards are #profile, #visa, …; #rirekisho-info is gone.
    expect(screen.getByRole("link", { name: d("goToSettings") })).toHaveAttribute(
      "href",
      "/dashboard/settings#profile",
    );
  });

  it("explains a profile that can't be loaded, and retries it", async () => {
    me.current = { ...me.current, data: undefined };
    await act(async () => {
      renderIn(LANG, <Rirekisho />);
    });
    expect(screen.getByRole("alert")).toHaveTextContent(d("profileLoadError"));
    fireEvent.click(screen.getByRole("button", { name: t("common", "tryAgain", LANG) }));
    expect(me.refetches).toBe(1);
  });
});

describe("the new-document wizard, by keyboard", () => {
  it("moves focus to the next step's title, not onto the next step's Back button", async () => {
    // Each step's first button is the same element to React, so focus used to
    // stay put and land on Back: a second Enter went straight back a step.
    create.current = {
      mutateAsync: () => Promise.resolve({ id: "d" }),
      isPending: false,
      error: null,
    };
    await act(async () => {
      renderIn(LANG, <Shokumu />);
    });
    fireEvent.click(screen.getByRole("radio"));
    const next = screen.getByRole("button", { name: d("wizNext") });
    next.focus();
    fireEvent.click(next);
    expect(document.activeElement).toBe(screen.getByText(d("wizStep2Title")));
  });
});
