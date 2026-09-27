import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { renderIn } from "../helpers";
import { t } from "@/lib/i18n";
import type { VisaOption, VisaRoadmap } from "@/types/api";

vi.mock("@/hooks/useVisa", () => ({ useUpdateProgress: () => ({ mutate: () => {} }) }));

const { VisaOptionCard } = await import("@/components/visa/visa-option-card");
const { VisaChecklistView } = await import("@/components/visa/visa-checklist");

const LANG = "en";
const v = (key: Parameters<typeof t>[1]) => t("visa", key, LANG);

const OPTION: VisaOption = {
  visa_type: "Engineer / Specialist in Humanities",
  eligibility: "eligible_with_gaps",
  summary: "The usual route for office work.",
  key_requirements: ["A degree"],
  gaps: ["No job offer yet"],
  estimated_months: 3,
  recommended: true,
};

const ROADMAP: VisaRoadmap = {
  id: "rm1",
  visa_type: OPTION.visa_type,
  ai_guidance: null,
  checklist: {
    phases: [
      {
        phase: "Documents",
        description: "Gather what the application needs.",
        steps: [
          {
            id: "s1",
            title: "Degree certificate",
            detail: "A certified copy.",
            required: true,
            estimated_weeks: 1,
            resources: [],
          },
        ],
      },
      {
        phase: "Apply",
        description: "Submit the application.",
        steps: [
          {
            id: "s2",
            title: "Submit",
            detail: "At the immigration bureau.",
            required: false,
            estimated_weeks: 0,
            resources: [],
          },
        ],
      },
    ],
  },
  completed_steps: ["s1"],
  created_at: "2026-09-01T00:00:00Z",
  updated_at: "2026-09-01T00:00:00Z",
};

describe("VisaOptionCard", () => {
  it("shows eligibility as a warning badge when there are gaps", () => {
    renderIn(
      LANG,
      <VisaOptionCard option={OPTION} hasRoadmap={false} isBuilding={false} onSelect={() => {}} />,
    );
    expect(screen.getByText(v("eligibleWithGaps"))).toHaveClass("text-warning");
    expect(screen.getByText(v("recommendedBadge"))).toHaveClass("text-indigo");
  });

  it("stays focusable but busy while its roadmap is being built", () => {
    renderIn(
      LANG,
      <VisaOptionCard option={OPTION} hasRoadmap={false} isBuilding onSelect={() => {}} />,
    );
    const button = screen.getByRole("button", { name: new RegExp(v("building")) });
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(button).not.toBeDisabled();
  });
});

describe("VisaChecklistView", () => {
  it("says which phase is open, and opens another on click", () => {
    renderIn(LANG, <VisaChecklistView roadmap={ROADMAP} />);
    const documents = screen.getByRole("button", { name: /Documents/ });
    const apply = screen.getByRole("button", { name: /Apply/ });
    expect(documents).toHaveAttribute("aria-expanded", "true");
    expect(apply).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(apply);
    expect(apply).toHaveAttribute("aria-expanded", "true");
    expect(documents).toHaveAttribute("aria-expanded", "false");
  });

  it("marks a finished phase with an icon, not a text tick", () => {
    renderIn(LANG, <VisaChecklistView roadmap={ROADMAP} />);
    const documents = screen.getByRole("button", { name: /Documents/ });
    expect(documents).not.toHaveTextContent("✓");
    expect(documents.querySelector("svg.lucide-check")).not.toBeNull();
  });

  it("ticks a step from its labelled checkbox", () => {
    renderIn(LANG, <VisaChecklistView roadmap={ROADMAP} />);
    const box = screen.getByRole("checkbox", { name: "Degree certificate" });
    expect(box).toBeChecked();
    fireEvent.click(box);
    expect(box).not.toBeChecked();
  });
});
