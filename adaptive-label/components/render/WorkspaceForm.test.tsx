import { describe, it, expect, vi } from "vitest";
import { render, screen, within, fireEvent } from "@testing-library/react";

import { WorkspaceForm, groupFields } from "@/components/render/WorkspaceForm";
import type { LabelField, WorkspaceSchema } from "@/lib/schemas/workspace";

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

function makeSchema(fields: LabelField[]): WorkspaceSchema {
  return {
    domain: "test",
    workspaceName: "Test Workspace",
    timelineMode: "beat_grid",
    workflowStages: ["draft", "submitted"],
    fields,
  } as WorkspaceSchema;
}

describe("groupFields", () => {
  it("preserves group first-appearance order and within-group field order", () => {
    const fields = [
      makeField({ key: "a", group: "G1" }),
      makeField({ key: "b", group: "G2" }),
      makeField({ key: "c", group: "G1" }),
      makeField({ key: "d", group: null }),
    ];
    const groups = groupFields(fields);
    expect(groups.map((g) => g.name)).toEqual(["G1", "G2", null]);
    expect(groups[0].fields.map((f) => f.key)).toEqual(["a", "c"]);
    expect(groups[1].fields.map((f) => f.key)).toEqual(["b"]);
    expect(groups[2].fields.map((f) => f.key)).toEqual(["d"]);
  });
});

describe("WorkspaceForm", () => {
  it("renders fields grouped by group with correct headings", () => {
    const schema = makeSchema([
      makeField({ key: "move_name", label: "Move name", group: "Identification" }),
      makeField({ key: "difficulty", label: "Difficulty", type: "slider", min: 1, max: 10, group: "Assessment" }),
    ]);
    render(<WorkspaceForm schema={schema} />);

    const ident = screen.getByRole("region", { name: "Identification" });
    expect(within(ident).getByText("Move name")).toBeInTheDocument();

    const assess = screen.getByRole("region", { name: "Assessment" });
    expect(within(assess).getByText("Difficulty")).toBeInTheDocument();

    // Headings rendered for named groups.
    expect(screen.getByRole("heading", { name: "Identification" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Assessment" })).toBeInTheDocument();
  });

  it("preserves field order within a group", () => {
    const schema = makeSchema([
      makeField({ key: "first", label: "First", group: "G" }),
      makeField({ key: "second", label: "Second", group: "G" }),
      makeField({ key: "third", label: "Third", group: "G" }),
    ]);
    render(<WorkspaceForm schema={schema} />);
    const labels = screen.getAllByText(/First|Second|Third/).map((el) => el.textContent);
    expect(labels).toEqual(["First", "Second", "Third"]);
  });

  it("handles ungrouped fields under a default section", () => {
    const schema = makeSchema([
      makeField({ key: "loose1", label: "Loose one", group: null }),
      makeField({ key: "loose2", label: "Loose two", group: null }),
    ]);
    render(<WorkspaceForm schema={schema} />);
    const general = screen.getByRole("region", { name: "General" });
    expect(within(general).getByText("Loose one")).toBeInTheDocument();
    expect(within(general).getByText("Loose two")).toBeInTheDocument();
  });

  it("applies options/min/max to the rendered controls", () => {
    const schema = makeSchema([
      makeField({ key: "cat", label: "Category", type: "select", options: ["turn", "dip"], group: "G" }),
      makeField({ key: "level", label: "Level", type: "slider", min: 2, max: 8, group: "G" }),
    ]);
    render(<WorkspaceForm schema={schema} />);
    expect(screen.getByRole("option", { name: "turn" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "dip" })).toBeInTheDocument();
    const slider = screen.getByRole("slider") as HTMLInputElement;
    expect(slider.min).toBe("2");
    expect(slider.max).toBe("8");
  });

  it("starts not dirty and marks dirty after editing a value", () => {
    const onChange = vi.fn();
    const schema = makeSchema([makeField({ key: "move_name", label: "Move name", group: "G" })]);
    render(
      <WorkspaceForm
        schema={schema}
        initialValues={{ move_name: "" }}
        onChange={onChange}
      />,
    );

    expect(screen.getByTestId("dirty-indicator")).toHaveAttribute("data-dirty", "false");

    fireEvent.change(screen.getByLabelText("Move name"), { target: { value: "cambré" } });

    expect(screen.getByTestId("dirty-indicator")).toHaveAttribute("data-dirty", "true");
    expect(onChange).toHaveBeenLastCalledWith({
      values: { move_name: "cambré" },
      dirty: true,
    });
  });

  it("clears dirty when reset back to the initial values", () => {
    const schema = makeSchema([makeField({ key: "move_name", label: "Move name", group: "G" })]);
    render(<WorkspaceForm schema={schema} initialValues={{ move_name: "basic" }} />);

    const input = screen.getByLabelText("Move name");
    fireEvent.change(input, { target: { value: "changed" } });
    expect(screen.getByTestId("dirty-indicator")).toHaveAttribute("data-dirty", "true");

    fireEvent.click(screen.getByRole("button", { name: "Reset" }));
    expect(screen.getByTestId("dirty-indicator")).toHaveAttribute("data-dirty", "false");
    expect((input as HTMLInputElement).value).toBe("basic");
  });

  it("reports current values and dirtiness on submit", () => {
    const onSubmit = vi.fn();
    const schema = makeSchema([
      makeField({ key: "move_name", label: "Move name", group: "G" }),
      makeField({ key: "cat", label: "Category", type: "select", options: ["turn", "dip"], group: "G" }),
    ]);
    render(
      <WorkspaceForm
        schema={schema}
        initialValues={{ move_name: "", cat: "" }}
        onSubmit={onSubmit}
      />,
    );

    fireEvent.change(screen.getByLabelText("Move name"), { target: { value: "spin" } });
    fireEvent.change(screen.getByLabelText("Category"), { target: { value: "turn" } });
    fireEvent.click(screen.getByRole("button", { name: "Submit annotation" }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith({
      values: { move_name: "spin", cat: "turn" },
      dirty: true,
    });
  });

  it("reports not dirty on submit when nothing changed", () => {
    const onSubmit = vi.fn();
    const schema = makeSchema([makeField({ key: "move_name", label: "Move name", group: "G" })]);
    render(
      <WorkspaceForm
        schema={schema}
        initialValues={{ move_name: "basic" }}
        onSubmit={onSubmit}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Submit annotation" }));
    expect(onSubmit).toHaveBeenCalledWith({
      values: { move_name: "basic" },
      dirty: false,
    });
  });
});
