import { useState } from "react";
import { describe, expect, it } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Switch } from "@/components/ui/switch";
import { TagInput } from "@/components/ui/tag-input";

describe("Field", () => {
  it("names its control and ties the hint and error to it", () => {
    render(
      <Field label="Phone" hint="With the area code" error="Too short">
        <Input />
      </Field>,
    );
    const input = screen.getByRole("textbox", { name: "Phone" });
    expect(input).toHaveAccessibleDescription("With the area code Too short");
    expect(input).toHaveAttribute("aria-invalid", "true");
  });

  it("is valid, and says Optional only when told", () => {
    render(
      <Field label="Hobbies" optionalLabel="Optional">
        <Input />
      </Field>,
    );
    expect(screen.getByText("Optional")).toBeInTheDocument();
    expect(screen.getByRole("textbox")).not.toHaveAttribute("aria-invalid");
  });

  it("keeps an id the control already has", () => {
    render(
      <Field label="Phone">
        <Input id="rirekisho-field-phone_number" />
      </Field>,
    );
    expect(screen.getByRole("textbox", { name: "Phone" })).toHaveAttribute(
      "id",
      "rirekisho-field-phone_number",
    );
  });
});

describe("Input", () => {
  it("marks an unsaved change", () => {
    render(<Input aria-label="Name" changed />);
    expect(screen.getByRole("textbox", { name: "Name" }).className).toContain("border-indigo");
  });
});

describe("Switch", () => {
  function Harness() {
    const [on, setOn] = useState(false);
    return <Switch checked={on} onCheckedChange={setOn} label="Show commute time" />;
  }

  it("is a named switch that toggles on click", () => {
    render(<Harness />);
    const toggle = screen.getByRole("switch", { name: "Show commute time" });
    expect(toggle).toHaveAttribute("aria-checked", "false");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-checked", "true");
  });

  it("toggles from its visible label too", () => {
    render(<Harness />);
    fireEvent.click(screen.getByText("Show commute time"));
    expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "true");
  });
});

describe("SegmentedControl", () => {
  function Harness() {
    const [value, setValue] = useState<"none" | "held">("none");
    return (
      <SegmentedControl
        legend="Current visa status"
        name="visa_status"
        value={value}
        options={[
          { value: "none", label: "No visa" },
          { value: "held", label: "Currently held" },
        ]}
        onChange={setValue}
      />
    );
  }

  it("is a radio group named by its legend", () => {
    render(<Harness />);
    const group = screen.getByRole("group", { name: "Current visa status" });
    expect(within(group).getByRole("radio", { name: "No visa" })).toBeChecked();
    fireEvent.click(within(group).getByRole("radio", { name: "Currently held" }));
    expect(within(group).getByRole("radio", { name: "Currently held" })).toBeChecked();
  });
});

describe("TagInput", () => {
  function Harness({ initial = [] as string[] }) {
    const [tags, setTags] = useState(initial);
    return (
      <>
        <TagInput
          aria-label="Target roles"
          value={tags}
          onChange={setTags}
          placeholder="Add a role…"
          removeLabel="Remove {tag}"
        />
        <output>{tags.join("|")}</output>
      </>
    );
  }
  const box = () => screen.getByRole("textbox", { name: "Target roles" });
  const tags = () => screen.getByRole("status").textContent;

  it("adds on Enter, trimmed, without submitting a form", () => {
    render(<Harness />);
    fireEvent.change(box(), { target: { value: "  Backend Engineer " } });
    // jsdom never submits a form on Enter, so a submit handler would pass
    // either way. What stops the browser submitting is the cancelled key
    // press, and fireEvent returns false exactly when it was cancelled.
    expect(fireEvent.keyDown(box(), { key: "Enter" })).toBe(false);
    expect(tags()).toBe("Backend Engineer");
  });

  it("adds on a comma, keeping what follows it", () => {
    render(<Harness />);
    fireEvent.change(box(), { target: { value: "SRE, Data" } });
    expect(tags()).toBe("SRE");
    expect(box()).toHaveValue(" Data");
  });

  it("ignores blanks and duplicates", () => {
    render(<Harness initial={["SRE"]} />);
    fireEvent.change(box(), { target: { value: "SRE" } });
    fireEvent.keyDown(box(), { key: "Enter" });
    fireEvent.change(box(), { target: { value: "   " } });
    fireEvent.keyDown(box(), { key: "Enter" });
    expect(tags()).toBe("SRE");
  });

  it("removes the last tag on Backspace in an empty box", () => {
    render(<Harness initial={["SRE", "Data"]} />);
    fireEvent.keyDown(box(), { key: "Backspace" });
    expect(tags()).toBe("SRE");
  });

  it("removes a tag from its named button", () => {
    render(<Harness initial={["SRE", "Data"]} />);
    fireEvent.click(screen.getByRole("button", { name: "Remove SRE" }));
    expect(tags()).toBe("Data");
  });

  it("keeps a half-typed tag when the box loses focus", () => {
    render(<Harness />);
    fireEvent.change(box(), { target: { value: "QA" } });
    fireEvent.blur(box());
    expect(tags()).toBe("QA");
  });
});
