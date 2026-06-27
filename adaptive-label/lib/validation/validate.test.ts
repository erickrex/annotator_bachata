import { describe, it, expect } from "vitest";
import {
  validateAnnotation,
  extraneousValueKeys,
  isValuesSubsetOfSchema,
} from "@/lib/validation";
import { PRESETS, type LabelField, type WorkspaceSchema } from "@/lib/schemas/workspace";

/** Build a minimal valid WorkspaceSchema from an arbitrary field list. */
function schemaWith(fields: LabelField[]): WorkspaceSchema {
  return {
    domain: "test",
    workspaceName: "Test",
    timelineMode: "beat_grid",
    fields,
    workflowStages: ["draft"],
  };
}

function field(overrides: Partial<LabelField>): LabelField {
  return {
    key: "f",
    label: "F",
    help: null,
    type: "text",
    required: false,
    options: null,
    min: null,
    max: null,
    group: null,
    ...overrides,
  };
}

describe("validateAnnotation — required presence", () => {
  it("reports a required field that is missing", () => {
    const schema = schemaWith([field({ key: "move_name", type: "text", required: true })]);
    const errors = validateAnnotation(schema, {});
    expect(errors).toEqual([
      expect.objectContaining({ field: "move_name", rule: "required" }),
    ]);
  });

  it("reports a required field that is an empty string", () => {
    const schema = schemaWith([field({ key: "move_name", type: "text", required: true })]);
    const errors = validateAnnotation(schema, { move_name: "   " });
    expect(errors).toHaveLength(1);
    expect(errors[0].rule).toBe("required");
  });

  it("reports a required multiselect that is an empty array", () => {
    const schema = schemaWith([
      field({ key: "tags", type: "multiselect", required: true, options: ["a", "b"] }),
    ]);
    const errors = validateAnnotation(schema, { tags: [] });
    expect(errors).toEqual([
      expect.objectContaining({ field: "tags", rule: "required" }),
    ]);
  });

  it("accepts a present required value", () => {
    const schema = schemaWith([field({ key: "move_name", type: "text", required: true })]);
    expect(validateAnnotation(schema, { move_name: "cross body" })).toEqual([]);
  });

  it("skips required check for optional absent fields", () => {
    const schema = schemaWith([field({ key: "notes", type: "textarea", required: false })]);
    expect(validateAnnotation(schema, {})).toEqual([]);
  });

  it("treats a checkbox false as present (not missing)", () => {
    const schema = schemaWith([field({ key: "on_beat", type: "checkbox", required: true })]);
    expect(validateAnnotation(schema, { on_beat: false })).toEqual([]);
  });
});

describe("validateAnnotation — enum membership", () => {
  it("reports a select value not in options", () => {
    const schema = schemaWith([
      field({ key: "cat", type: "select", options: ["basic", "turn"] }),
    ]);
    const errors = validateAnnotation(schema, { cat: "dip" });
    expect(errors).toEqual([expect.objectContaining({ field: "cat", rule: "enum" })]);
  });

  it("accepts a select value in options", () => {
    const schema = schemaWith([
      field({ key: "cat", type: "select", options: ["basic", "turn"] }),
    ]);
    expect(validateAnnotation(schema, { cat: "turn" })).toEqual([]);
  });

  it("reports a radio value not in options", () => {
    const schema = schemaWith([
      field({ key: "role", type: "radio", options: ["lead", "follow"] }),
    ]);
    const errors = validateAnnotation(schema, { role: "both" });
    expect(errors).toEqual([expect.objectContaining({ field: "role", rule: "enum" })]);
  });

  it("reports multiselect values not all in options", () => {
    const schema = schemaWith([
      field({ key: "fw", type: "multiselect", options: ["tap", "side_step"] }),
    ]);
    const errors = validateAnnotation(schema, { fw: ["tap", "spin"] });
    expect(errors).toEqual([expect.objectContaining({ field: "fw", rule: "enum" })]);
  });

  it("accepts a multiselect whose values are all in options", () => {
    const schema = schemaWith([
      field({ key: "fw", type: "multiselect", options: ["tap", "side_step"] }),
    ]);
    expect(validateAnnotation(schema, { fw: ["tap", "side_step"] })).toEqual([]);
  });

  it("skips enum check when an optional enum field is absent", () => {
    const schema = schemaWith([
      field({ key: "cat", type: "select", options: ["basic", "turn"] }),
    ]);
    expect(validateAnnotation(schema, {})).toEqual([]);
  });
});

describe("validateAnnotation — numeric range", () => {
  it("reports a value under the minimum", () => {
    const schema = schemaWith([field({ key: "diff", type: "slider", min: 1, max: 10 })]);
    const errors = validateAnnotation(schema, { diff: 0 });
    expect(errors).toEqual([expect.objectContaining({ field: "diff", rule: "range" })]);
  });

  it("reports a value over the maximum", () => {
    const schema = schemaWith([field({ key: "diff", type: "number", min: 1, max: 10 })]);
    const errors = validateAnnotation(schema, { diff: 11 });
    expect(errors).toEqual([expect.objectContaining({ field: "diff", rule: "range" })]);
  });

  it("accepts a value at the boundaries", () => {
    const schema = schemaWith([field({ key: "diff", type: "slider", min: 1, max: 10 })]);
    expect(validateAnnotation(schema, { diff: 1 })).toEqual([]);
    expect(validateAnnotation(schema, { diff: 10 })).toEqual([]);
  });

  it("range-checks each endpoint of a time_range tuple", () => {
    const schema = schemaWith([field({ key: "span", type: "time_range", min: 0, max: 100 })]);
    const errors = validateAnnotation(schema, { span: [-1, 200] });
    expect(errors).toHaveLength(2);
    expect(errors.every((e) => e.rule === "range")).toBe(true);
  });

  it("range-checks a timeline_marker numeric value", () => {
    const schema = schemaWith([field({ key: "mark", type: "timeline_marker", min: 0, max: 32 })]);
    expect(validateAnnotation(schema, { mark: 16 })).toEqual([]);
    expect(validateAnnotation(schema, { mark: 40 })).toHaveLength(1);
  });

  it("does not range-check non-range field types", () => {
    const schema = schemaWith([field({ key: "name", type: "text", min: 1, max: 5 })]);
    expect(validateAnnotation(schema, { name: "a very long string" })).toEqual([]);
  });
});

describe("validateAnnotation — valid full annotations (presets)", () => {
  it("accepts a complete valid bachata annotation", () => {
    const errors = validateAnnotation(PRESETS.bachata, {
      move_name: "cross body lead",
      move_category: "turn",
      lead_follow_role: "lead",
      difficulty: 5,
      phrase_count: 8,
      footwork_patterns: ["tap", "side_step"],
      on_beat: true,
      beat_marker: 4,
      styling_notes: "smooth",
    });
    expect(errors).toEqual([]);
  });

  it("accepts a minimal valid annotation with only required fields", () => {
    const errors = validateAnnotation(PRESETS.sign_language, {
      gloss: "HELLO",
      sign_type: "lexical",
    });
    expect(errors).toEqual([]);
  });

  it("collects multiple errors across rules", () => {
    const errors = validateAnnotation(PRESETS.bachata, {
      // move_name (required) missing
      move_category: "not_a_category", // enum
      difficulty: 99, // range
    });
    const rules = errors.map((e) => e.rule).sort();
    expect(rules).toEqual(["enum", "range", "required"]);
  });
});

describe("values-key subset helpers", () => {
  it("flags keys not defined in the schema", () => {
    expect(extraneousValueKeys(PRESETS.bachata, { move_name: "x", bogus: 1 })).toEqual([
      "bogus",
    ]);
  });

  it("reports subset when all keys are schema fields", () => {
    expect(isValuesSubsetOfSchema(PRESETS.bachata, { move_name: "x" })).toBe(true);
    expect(isValuesSubsetOfSchema(PRESETS.bachata, { ghost: 1 })).toBe(false);
  });
});
