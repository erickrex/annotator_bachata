import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import { FieldRenderer } from "@/components/render/FieldRenderer";
import { FieldType, type LabelField } from "@/lib/schemas/workspace";

function makeField(overrides: Partial<LabelField>): LabelField {
  return {
    key: "f",
    label: "Field label",
    help: null,
    type: "text",
    required: false,
    options: null,
    min: null,
    max: null,
    group: null,
    ...overrides,
  } as LabelField;
}

describe("FieldRenderer", () => {
  it("renders a control for every allowed field type without throwing", () => {
    for (const type of FieldType.options) {
      const field = makeField({
        key: `k_${type}`,
        label: `Label ${type}`,
        type,
        options:
          type === "select" || type === "multiselect" || type === "radio"
            ? ["a", "b"]
            : null,
        min: type === "slider" || type === "number" ? 0 : null,
        max: type === "slider" || type === "number" ? 10 : null,
      });
      const { container, unmount } = render(
        <FieldRenderer field={field} value={undefined} onChange={() => {}} />,
      );
      // Something was rendered for every known type.
      expect(container.firstChild).not.toBeNull();
      unmount();
    }
  });

  it("renders the label and required marker", () => {
    render(
      <FieldRenderer
        field={makeField({ label: "Move name", required: true })}
        value=""
        onChange={() => {}}
      />,
    );
    expect(screen.getByText("Move name")).toBeInTheDocument();
    expect(screen.getByText("*")).toBeInTheDocument();
  });

  it("applies options to a select control", () => {
    render(
      <FieldRenderer
        field={makeField({ type: "select", options: ["turn", "dip"] })}
        value=""
        onChange={() => {}}
      />,
    );
    expect(screen.getByRole("option", { name: "turn" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "dip" })).toBeInTheDocument();
  });

  it("applies min/max to a slider control", () => {
    render(
      <FieldRenderer
        field={makeField({ type: "slider", min: 2, max: 8 })}
        value={5}
        onChange={() => {}}
      />,
    );
    const slider = screen.getByRole("slider") as HTMLInputElement;
    expect(slider.min).toBe("2");
    expect(slider.max).toBe("8");
  });

  it("skips an unknown field type and renders nothing", () => {
    const onChange = vi.fn();
    const { container } = render(
      <FieldRenderer
        // Cast to inject an out-of-set type that real data could carry.
        field={makeField({ type: "rich_text" as unknown as LabelField["type"] })}
        value={undefined}
        onChange={onChange}
      />,
    );
    expect(container.firstChild).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });
});
