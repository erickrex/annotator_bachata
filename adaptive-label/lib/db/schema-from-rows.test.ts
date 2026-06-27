import { describe, it, expect } from "vitest";

import {
  labelFieldFromRow,
  workspaceSchemaFromRows,
} from "./schema-from-rows";
import type { LabelFieldRow, LabelSchemaRow } from "./types";

/**
 * Unit tests for reconstructing the `WorkspaceSchema` shape from stored rows.
 *
 * These cover the column-shape conversions the validator depends on:
 * empty `options_json` → `null`, numeric strings → numbers, field order
 * preservation, and timeline-mode/name passthrough.
 */

function fieldRow(overrides: Partial<LabelFieldRow>): LabelFieldRow {
  return {
    id: "field-1",
    schema_id: "schema-1",
    key: "move_name",
    label: "Move name",
    help: null,
    field_type: "text",
    required: false,
    options_json: [],
    min: null,
    max: null,
    field_group: null,
    order_index: 0,
    ...overrides,
  };
}

function schemaRow(overrides: Partial<LabelSchemaRow> = {}): LabelSchemaRow {
  return {
    id: "schema-1",
    project_id: "proj-1",
    version: 1,
    name: "Bachata Move Annotation",
    timeline_mode: "beat_grid",
    status: "active",
    generation_prompt: null,
    created_at: new Date(),
    activated_at: new Date(),
    ...overrides,
  };
}

describe("labelFieldFromRow", () => {
  it("maps an empty options_json array to null so non-enum fields skip enum checks", () => {
    const field = labelFieldFromRow(fieldRow({ field_type: "text" }));
    expect(field.options).toBeNull();
  });

  it("preserves a non-empty options_json array", () => {
    const field = labelFieldFromRow(
      fieldRow({ field_type: "select", options_json: ["basic", "turn"] }),
    );
    expect(field.options).toEqual(["basic", "turn"]);
  });

  it("parses numeric min/max strings (pg numeric) back to numbers", () => {
    const field = labelFieldFromRow(
      fieldRow({ field_type: "slider", min: "1", max: "10" }),
    );
    expect(field.min).toBe(1);
    expect(field.max).toBe(10);
    expect(typeof field.min).toBe("number");
  });

  it("keeps null min/max as null", () => {
    const field = labelFieldFromRow(fieldRow({ min: null, max: null }));
    expect(field.min).toBeNull();
    expect(field.max).toBeNull();
  });

  it("carries key, label, help, type, required, and group through unchanged", () => {
    const field = labelFieldFromRow(
      fieldRow({
        key: "difficulty",
        label: "Difficulty",
        help: "1-10",
        field_type: "slider",
        required: true,
        field_group: "Assessment",
      }),
    );
    expect(field).toMatchObject({
      key: "difficulty",
      label: "Difficulty",
      help: "1-10",
      type: "slider",
      required: true,
      group: "Assessment",
    });
  });
});

describe("workspaceSchemaFromRows", () => {
  it("preserves the order of the supplied field rows", () => {
    const rows = [
      fieldRow({ key: "a", order_index: 0 }),
      fieldRow({ key: "b", order_index: 1 }),
      fieldRow({ key: "c", order_index: 2 }),
    ];
    const schema = workspaceSchemaFromRows(schemaRow(), rows);
    expect(schema.fields.map((f) => f.key)).toEqual(["a", "b", "c"]);
  });

  it("carries the timeline mode and name from the schema row", () => {
    const schema = workspaceSchemaFromRows(
      schemaRow({ name: "Gloss", timeline_mode: "gloss_segments" }),
      [fieldRow({ key: "gloss" })],
    );
    expect(schema.timelineMode).toBe("gloss_segments");
    expect(schema.workspaceName).toBe("Gloss");
  });
});
