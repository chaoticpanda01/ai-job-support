import { describe, expect, it } from "vitest";
import { screen, within } from "@testing-library/react";
import { renderIn } from "../helpers";
import { t, type Language } from "@/lib/i18n";
import { HomePreview, JobPreview, ScorePreview, VisaPreview } from "@/components/landing/previews";

const PREVIEWS = [
  ["HomePreview", HomePreview, "previewHomeLabel"],
  ["ScorePreview", ScorePreview, "previewScoreLabel"],
  ["JobPreview", JobPreview, "previewJobLabel"],
  ["VisaPreview", VisaPreview, "previewVisaLabel"],
] as const;

const FOCUSABLE = "a, button, input, select, textarea, [tabindex]";

describe.each(PREVIEWS)("%s", (_, Preview, labelKey) => {
  it.each<Language>(["en", "ja"])("is one image, described in %s", (lang) => {
    renderIn(lang, <Preview />);
    expect(screen.getByRole("img", { name: t("landing", labelKey, lang) })).toBeInTheDocument();
  });

  it("hides its insides from assistive tech and keyboard", () => {
    renderIn("en", <Preview />);
    const image = screen.getByRole("img");
    // A progress bar inside would otherwise be announced on its own.
    expect(within(image).queryAllByRole("progressbar")).toEqual([]);
    expect(image.querySelectorAll(FOCUSABLE)).toHaveLength(0);
  });
});

describe("HomePreview", () => {
  it("uses the app's own journey strings, so it follows the language", () => {
    renderIn("ja", <HomePreview />);
    const image = screen.getByRole("img");
    expect(image).toHaveTextContent(t("journey", "shokumuTitle", "ja"));
    expect(image).toHaveTextContent("おかえりなさい、Budiさん");
    expect(image).toHaveTextContent(t("nav", "groupSettleIn", "ja"));
  });

  it("shows the same progress as its next step implies: 4 of 8", () => {
    renderIn("en", <HomePreview />);
    expect(screen.getByRole("img")).toHaveTextContent(
      t("home", "progress", "en").replace("{done}", "4").replace("{total}", "8"),
    );
  });
});
