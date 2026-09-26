import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import { renderIn } from "../helpers";
import { t, type Language } from "@/lib/i18n";

const session = vi.hoisted(() => ({ userId: null as string | null }));

vi.mock("@clerk/nextjs/server", () => ({ auth: async () => ({ userId: session.userId }) }));
vi.mock("@clerk/nextjs", () => ({
  UserButton: () => <button type="button">Open user menu</button>,
}));

const pageModule = await import("@/app/page");
const Page = pageModule.default;

const l = (key: string, lang: Language = "en") => t("landing", key, lang);

/** Render the page as the server would for the current session. */
async function renderLanding(lang: Language = "en") {
  return renderIn(lang, await Page());
}

beforeEach(() => {
  session.userId = null;
});

describe("landing page: signed out", () => {
  it("offers sign in and sign up, everywhere it matters", async () => {
    await renderLanding();
    expect(screen.getByRole("link", { name: t("nav", "signIn", "en") })).toHaveAttribute(
      "href",
      "/sign-in",
    );
    const startFree = screen.getAllByRole("link", { name: l("startFree") });
    // Header, hero and the final prompt.
    expect(startFree).toHaveLength(3);
    for (const link of startFree) expect(link).toHaveAttribute("href", "/sign-up");
    expect(screen.queryByRole("link", { name: l("goToDashboard") })).not.toBeInTheDocument();
  });

  it("ends with the final prompt", async () => {
    await renderLanding();
    expect(screen.getByRole("heading", { level: 2, name: l("finalTitle") })).toBeInTheDocument();
  });
});

describe("landing page: signed in", () => {
  beforeEach(() => {
    session.userId = "user_123";
  });

  it("goes to the dashboard instead of asking to sign up", async () => {
    await renderLanding();
    const dashboard = screen.getAllByRole("link", { name: l("goToDashboard") });
    expect(dashboard.length).toBeGreaterThanOrEqual(2); // header and hero
    for (const link of dashboard) expect(link).toHaveAttribute("href", "/dashboard");
    expect(screen.queryByRole("link", { name: l("startFree") })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: t("nav", "signIn", "en") })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open user menu" })).toBeInTheDocument();
  });

  it("has no final sign-up prompt", async () => {
    await renderLanding();
    expect(screen.queryByRole("heading", { name: l("finalTitle") })).not.toBeInTheDocument();
  });
});

describe("landing page: structure", () => {
  it("has one h1, the headline", async () => {
    await renderLanding();
    const h1s = screen.getAllByRole("heading", { level: 1 });
    expect(h1s).toHaveLength(1);
    expect(h1s[0]).toHaveTextContent(l("heroTitle"));
  });

  it("titles every section with an h2", async () => {
    await renderLanding();
    const h2s = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(h2s).toEqual([l("journeyTitle"), l("factsTitle"), l("aboutTitle"), l("finalTitle")]);
  });

  it("titles each stage with an h3", async () => {
    await renderLanding();
    for (const key of ["prepareTitle", "applyTitle", "settleTitle"]) {
      expect(screen.getByRole("heading", { level: 3, name: l(key) })).toBeInTheDocument();
    }
  });

  it("shows the product: four described previews", async () => {
    await renderLanding();
    for (const key of [
      "previewHomeLabel",
      "previewScoreLabel",
      "previewJobLabel",
      "previewVisaLabel",
    ]) {
      expect(screen.getByRole("img", { name: l(key) })).toBeInTheDocument();
    }
  });

  it("jumps to the journey from 'See how it works'", async () => {
    const { container } = await renderLanding();
    expect(screen.getByRole("link", { name: l("seeHow") })).toHaveAttribute("href", "#how");
    expect(container.querySelector("#how")).toBeInTheDocument();
  });

  it("credits the project and links its code in a new tab, saying so", async () => {
    await renderLanding();
    const about = screen.getByRole("region", { name: l("aboutTitle") });
    expect(about).toHaveTextContent("chaoticpanda01");
    expect(about).toHaveTextContent("Next.js · FastAPI · PostgreSQL · Gemini · Clerk");
    const code = within(about).getByRole("link", { name: new RegExp(l("aboutCode")) });
    expect(code).toHaveAttribute("href", "https://github.com/chaoticpanda01/ai-job-support");
    expect(code).toHaveAttribute("target", "_blank");
    expect(code.getAttribute("rel")).toContain("noopener");
    expect(code).toHaveAccessibleName(`${l("aboutCode")} ${l("opensNewTab")}`);
  });

  it("dates the footer with the server's year", async () => {
    await renderLanding();
    expect(screen.getByRole("contentinfo")).toHaveTextContent(`© ${new Date().getFullYear()}`);
  });

  it("uses no emoji", async () => {
    const { container } = await renderLanding();
    // \p{Emoji_Presentation} and the emoji variation selector: the old 📄 and
    // 🗂️. Not Extended_Pictographic, which also matches the footer's ©.
    expect(container.textContent).not.toMatch(/\p{Emoji_Presentation}|\uFE0F/u);
  });

  it("exports a title and description for search and link previews", () => {
    expect(pageModule.metadata.title).toEqual({
      absolute: "Japan Job Support: your move to Japan, one step at a time",
    });
    expect(pageModule.metadata.description).toMatch(/Indonesian professionals/);
  });
});

describe("landing page: honest copy", () => {
  // Job translation and the visa guidance are written in Indonesian
  // (backend/app/services/ai/prompts), and Clerk's sign-in screens are
  // English only, so the page may not promise every screen in every language.
  it("says the visa guidance is in Indonesian, as it says of job translation", async () => {
    const { container } = await renderLanding();
    expect(l("settleTool1")).toMatch(/Bahasa Indonesia/);
    expect(l("applyLead")).toMatch(/Bahasa Indonesia/);
    expect(container).toHaveTextContent(l("settleTool1"));
  });

  it("doesn't claim the whole app, or every screen, is in three languages", async () => {
    const { container } = await renderLanding();
    expect(container.textContent).not.toMatch(/whole app|every screen/i);
  });
});

describe("landing page: line breaking", () => {
  // Browsers may break between any two kanji, which splits a Japanese word
  // inside English or Indonesian copy ("日 / 本語"). Japanese copy has no
  // spaces, so it needs those breaks and must not get keep-all.
  it.each<[Language, boolean]>([
    ["en", true],
    ["id", true],
    ["ja", false],
  ])("keeps Japanese words whole in %s: %s", async (lang, keepAll) => {
    const { container } = await renderLanding(lang);
    const root = container.firstElementChild as HTMLElement;
    expect(root.classList.contains("break-keep")).toBe(keepAll);
  });
});

describe.each<Language>(["ja", "id"])("landing page in %s", (lang) => {
  it("translates the headline and the previews", async () => {
    await renderLanding(lang);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(l("heroTitle", lang));
    expect(screen.getByRole("img", { name: l("previewHomeLabel", lang) })).toBeInTheDocument();
  });

  it("shows no raw string keys", async () => {
    const { container } = await renderLanding(lang);
    // t() prints the key when a string is missing; these are the keys the
    // page builds at runtime.
    expect(container.textContent).not.toMatch(
      /\b(?:prepare|apply|settle)(?:Title|Lead|Tool\d)\b|\bfact\d(?:Title|Text)\b/,
    );
  });
});
