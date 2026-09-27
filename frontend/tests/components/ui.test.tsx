import { useState } from "react";
import { describe, expect, it } from "vitest";
import Link from "next/link";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { FileText } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/ui/empty-state";
import { RadioCard } from "@/components/ui/radio-card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup } from "@/components/ui/toggle-group";
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

  it("is busy while loading, and ignores clicks without losing keyboard focus", () => {
    // Native disabled would drop focus to <body> the moment the button went
    // busy, and not give it back when the work finished.
    const clicks: string[] = [];
    render(
      <Button loading onClick={() => clicks.push("clicked")}>
        Save
      </Button>,
    );
    const button = screen.getByRole("button", { name: "Save" });
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(button).toHaveAttribute("aria-disabled", "true");
    expect(button).not.toBeDisabled();
    button.focus();
    fireEvent.click(button);
    expect(clicks).toEqual([]);
    expect(button).toHaveFocus();
  });

  it("does not submit its form while loading", () => {
    const submits: string[] = [];
    render(
      <form
        onSubmit={(event) => {
          event.preventDefault();
          submits.push("submitted");
        }}
      >
        <Button type="submit" loading>
          Save
        </Button>
      </form>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(submits).toEqual([]);
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

describe("EmptyState", () => {
  it("shows its title, description and action, and hides its icon", () => {
    const { container } = render(
      <EmptyState
        icon={FileText}
        title="No resumes yet"
        description="Upload one to get started."
        action={<a href="/upload">Upload</a>}
      />,
    );
    expect(screen.getByText("No resumes yet")).toBeInTheDocument();
    expect(screen.getByText("Upload one to get started.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Upload" })).toBeInTheDocument();
    // The title is text, not a heading: it must not break the page's outline.
    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
    expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });
});

describe("Alert", () => {
  it("announces a failure as an alert, and keeps its action out of the message", () => {
    render(
      <Alert tone="danger" action={<button type="button">Try again</button>}>
        Could not load.
      </Alert>,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Could not load.");
    expect(screen.getByRole("alert")).not.toHaveTextContent("Try again");
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it.each(["success", "info", "warning", "neutral"] as const)(
    "announces a %s message politely, as a status",
    (tone) => {
      render(<Alert tone={tone}>Done.</Alert>);
      expect(screen.getByRole("status")).toHaveTextContent("Done.");
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    },
  );

  it("shows a title above the message", () => {
    render(
      <Alert tone="danger" title="Generation failed">
        The resume could not be read.
      </Alert>,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Generation failedThe resume could not be read.",
    );
  });
});

describe("ToggleGroup", () => {
  function Harness() {
    const [value, setValue] = useState<"all" | "a">("all");
    return (
      <ToggleGroup
        label="Filter by type"
        value={value}
        options={[
          { value: "all", label: "All" },
          { value: "a", label: "履歴書", lang: "ja" },
        ]}
        onChange={setValue}
      />
    );
  }

  it("is a named group whose pressed button follows the value", () => {
    render(<Harness />);
    const group = screen.getByRole("group", { name: "Filter by type" });
    expect(group).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "All" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "履歴書" }));
    expect(screen.getByRole("button", { name: "履歴書" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "All" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "履歴書" })).toHaveAttribute("lang", "ja");
  });

  it("reports a click on the pressed option too, so a caller can toggle it off", () => {
    const seen: string[] = [];
    render(
      <ToggleGroup
        label="Tags"
        value="a"
        options={[{ value: "a", label: "A" }]}
        onChange={(v) => seen.push(v)}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "A" }));
    expect(seen).toEqual(["a"]);
  });
});

describe("Tabs", () => {
  it("renders tabs whose panel follows the selected tab", () => {
    function Harness() {
      const [tab, setTab] = useState("one");
      return (
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList aria-label="Sections">
            <TabsTrigger value="one">One</TabsTrigger>
            <TabsTrigger value="two">Two</TabsTrigger>
          </TabsList>
          <TabsContent value="one">First panel</TabsContent>
          <TabsContent value="two">Second panel</TabsContent>
        </Tabs>
      );
    }
    render(<Harness />);
    expect(screen.getByRole("tablist", { name: "Sections" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "One" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel")).toHaveTextContent("First panel");
    // Radix selects on mousedown, not click.
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Two" }), { button: 0 });
    expect(screen.getByRole("tab", { name: "Two" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel")).toHaveTextContent("Second panel");
  });
});

describe("RadioCard", () => {
  it("is a radio named by its card's content", () => {
    const picked: string[] = [];
    render(
      <fieldset>
        <legend>Resume</legend>
        <RadioCard name="resume" value="r1" checked={false} onChange={() => picked.push("r1")}>
          <p>cv.pdf</p>
        </RadioCard>
      </fieldset>,
    );
    fireEvent.click(screen.getByRole("radio", { name: "cv.pdf" }));
    expect(picked).toEqual(["r1"]);
  });
});

describe("Checkbox", () => {
  it("is a native checkbox that keeps the props it is given", () => {
    render(<Checkbox aria-label="Publish" defaultChecked />);
    expect(screen.getByRole("checkbox", { name: "Publish" })).toBeChecked();
  });
});
