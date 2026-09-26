import { describe, expect, it } from "vitest";
import Link from "next/link";
import { render, screen, within } from "@testing-library/react";
import { Button } from "@/components/ui/button";
import { CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { BrandMark } from "@/components/brand-mark";

describe("Button", () => {
  it("is a plain button by default, so it never submits a form by accident", () => {
    render(<Button>Save</Button>);
    expect(screen.getByRole("button", { name: "Save" })).toHaveAttribute("type", "button");
  });

  it("renders its child instead with asChild, keeping the button styling", () => {
    render(
      <Button asChild>
        <Link href="/dashboard/resumes">Resumes</Link>
      </Button>,
    );
    const link = screen.getByRole("link", { name: "Resumes" });
    expect(link).toHaveAttribute("href", "/dashboard/resumes");
    expect(link.className).toContain("bg-primary");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("is disabled and busy while loading", () => {
    render(<Button loading>Save</Button>);
    const button = screen.getByRole("button", { name: "Save" });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
  });

  it("is not marked busy when idle", () => {
    render(<Button>Save</Button>);
    expect(screen.getByRole("button", { name: "Save" })).not.toHaveAttribute("aria-busy");
  });
});

describe("CardTitle", () => {
  it("is an h2 unless told otherwise", () => {
    render(
      <>
        <CardTitle>Default</CardTitle>
        <CardTitle as="h3">Nested</CardTitle>
      </>,
    );
    expect(screen.getByRole("heading", { level: 2, name: "Default" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3, name: "Nested" })).toBeInTheDocument();
  });
});

describe("PageHeader", () => {
  it("renders the title as the page's one h1, with its eyebrow and actions", () => {
    render(
      <PageHeader
        eyebrow="Prepare"
        title="履歴書"
        description="Generate a rirekisho"
        actions={<Button>New</Button>}
      />,
    );
    const headings = screen.getAllByRole("heading", { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveTextContent("履歴書");
    expect(screen.getByText("Prepare")).toBeInTheDocument();
    expect(screen.getByText("Generate a rirekisho")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New" })).toBeInTheDocument();
  });
});

describe("Progress", () => {
  it("exposes its value and name to assistive tech", () => {
    render(<Progress value={4} max={8} aria-label="Journey progress" />);
    const bar = screen.getByRole("progressbar", { name: "Journey progress" });
    expect(bar).toHaveAttribute("aria-valuenow", "4");
    expect(bar).toHaveAttribute("aria-valuemax", "8");
  });

  it("clamps a value past max instead of overflowing", () => {
    render(<Progress value={12} max={8} aria-label="Quota" />);
    expect(screen.getByRole("progressbar", { name: "Quota" })).toHaveAttribute(
      "aria-valuenow",
      "8",
    );
  });
});

describe("Skeleton", () => {
  it("is hidden from assistive tech", () => {
    const { container } = render(<Skeleton className="h-4" />);
    expect(container.firstChild).toHaveAttribute("aria-hidden", "true");
  });
});

describe("BrandMark", () => {
  it.each([false, true])("gives a link exactly the product's name (compact: %s)", (compact) => {
    // The 職 seal is decoration: were it read out, the name would be
    // "職 Japan Job Support".
    render(
      <Link href="/dashboard">
        <BrandMark compact={compact} />
      </Link>,
    );
    expect(screen.getByRole("link", { name: "Japan Job Support" })).toBeInTheDocument();
  });

  it("hides only the wordmark's text below sm when compact is 'mobile'", () => {
    render(
      <Link href="/">
        <BrandMark compact="mobile" />
      </Link>,
    );
    const link = screen.getByRole("link", { name: "Japan Job Support" });
    const wordmark = within(link).getByText("Japan Job Support");
    expect(wordmark).toHaveClass("sr-only", "sm:not-sr-only");
  });
});
