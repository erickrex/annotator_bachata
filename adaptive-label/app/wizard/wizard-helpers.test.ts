import { describe, it, expect } from "vitest";

import { PRESETS, type LabelField } from "@/lib/schemas/workspace";
import {
  toRenderableField,
  toRenderableFields,
  parseCompleteWorkspaceSchema,
  isCompleteWorkspaceSchema,
  type PartialWorkspaceSchema,
} from "./wizard-helpers";

describe("toRenderableField", () => {
  it("returns null for undefined or missing key/type", () => {
    expect(toRenderableField(undefined)).toBeNull();
    expect(toRenderableField({})).toBeNull();
    expect(toRenderableField({ key: "move" })).toBeNull(); // no type yet
    expect(toRenderableField({ type: "text" })).toBeNull(); // no key yet
    expect(toRenderableField({ key: "", type: "text" })).toBeNull();
  });

  it("returns null for an unknown field type", () => {
    expect(
      toRenderableField({ key: "move", type: "not_a_type" as LabelField["type"] }),
    ).toBeNull();
  });

  it("fills safe defaults for a minimally-complete field", () => {
    const field = toRenderableField({ key: "move_name", type: "text" });
    expect(field).toEqual({
      key: "move_name",
      label: "move_name", // falls back to key when label absent
      help: null,
      type: "text",
      required: false,
      options: null,
      min: null,
      max: null,
      group: null,
    });
  });

  it("preserves provided properties and filters non-string options", () => {
    const field = toRenderableField({
      key: "cat",
      label: "Category",
      type: "select",
      required: true,
      options: ["turn", undefined as unknown as string, "dip"],
      min: 1,
      max: 10,
      group: "Identification",
      help: "Pick one",
    });
    expect(field).toMatchObject({
      key: "cat",
      label: "Category",
      type: "select",
      required: true,
      options: ["turn", "dip"],
      min: 1,
      max: 10,
      group: "Identification",
      help: "Pick one",
    });
  });
});

describe("toRenderableFields", () => {
  it("returns an empty array when there are no fields yet", () => {
    expect(toRenderableFields(undefined)).toEqual([]);
    expect(toRenderableFields({})).toEqual([]);
    expect(toRenderableFields({ fields: [] })).toEqual([]);
  });

  it("skips incomplete entries but keeps order of renderable ones", () => {
    const partial: PartialWorkspaceSchema = {
      fields: [
        { key: "a", type: "text" },
        undefined, // a not-yet-started field
        { key: "b" }, // type still streaming
        { key: "c", type: "number" },
      ],
    };
    expect(toRenderableFields(partial).map((f) => f.key)).toEqual(["a", "c"]);
  });
});

describe("parseCompleteWorkspaceSchema / isCompleteWorkspaceSchema", () => {
  it("returns null for partial/invalid schemas", () => {
    expect(parseCompleteWorkspaceSchema(undefined)).toBeNull();
    expect(isCompleteWorkspaceSchema({})).toBe(false);
    expect(
      isCompleteWorkspaceSchema({
        domain: "bachata",
        workspaceName: "X",
        timelineMode: "beat_grid",
        fields: [{ key: "only_one", type: "text" }], // < 3 fields
        workflowStages: [],
      }),
    ).toBe(false);
  });

  it("accepts a complete preset schema and returns the typed value", () => {
    const parsed = parseCompleteWorkspaceSchema(
      PRESETS.bachata as unknown as PartialWorkspaceSchema,
    );
    expect(parsed).not.toBeNull();
    expect(parsed?.timelineMode).toBe("beat_grid");
    expect(parsed?.fields.length).toBe(PRESETS.bachata.fields.length);
    expect(isCompleteWorkspaceSchema(PRESETS.sign_language as unknown as PartialWorkspaceSchema)).toBe(true);
  });
});
