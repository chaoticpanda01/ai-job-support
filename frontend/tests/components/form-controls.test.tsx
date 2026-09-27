import { useState } from "react";
import { describe, expect, it } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Select } from "@/components/ui/select";
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

  it("greys out a read-only box, and only a text box", () => {
    // CSS :read-only matches every <select> and <div>, so read-only styling on
    // the shared classes greyed out editable selects and the tag box.
    render(
      <>
        <Input aria-label="Email" readOnly />
        <Select aria-label="Gender" />
        <TagInput aria-label="Roles" value={[]} onChange={() => {}} placeholder="" removeLabel="" />
      </>,
    );
    expect(screen.getByRole("textbox", { name: "Email" }).className).toContain("read-only:");
    expect(screen.getByRole("combobox", { name: "Gender" }).className).not.toContain("read-only:");
    const tagBox = screen.getByRole("textbox", { name: "Roles" }).parentElement as HTMLElement;
    expect(tagBox.className).not.toContain("read-only:");
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

  it("rings the whole control on keyboard focus, outside the dark checked segment", () => {
    // Tab lands on the checked radio, whose segment is near-black: an indigo
    // ring drawn inside it measured about 1.5:1. The group's own ring sits
    // outside, on the card, where indigo is well above 3:1.
    render(<Harness />);
    const segments = screen.getByRole("radio", { name: "No visa" }).closest("label")
      ?.parentElement as HTMLElement;
    expect(segments.className).toContain("has-[:focus-visible]:ring-2");
    expect(segments.className).toContain("has-[:focus-visible]:ring-offset-2");
  });
});

describe("SegmentedControl, languages", () => {
  it("marks a segment's language when it differs from the page", () => {
    render(
      <SegmentedControl
        legend="App language"
        name="lang"
        value="en"
        onChange={() => {}}
        options={[
          { value: "en", label: "English" },
          { value: "ja", label: "日本語", lang: "ja" },
        ]}
      />,
    );
    expect(screen.getByText("日本語")).toHaveAttribute("lang", "ja");
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

  it("keeps focus in the box after a tag is removed with its button", () => {
    // The button goes away with its tag, which would drop focus to <body>.
    render(<Harness initial={["SRE", "Data"]} />);
    const remove = screen.getByRole("button", { name: "Remove SRE" });
    remove.focus();
    fireEvent.click(remove);
    expect(document.activeElement).toBe(box());
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
