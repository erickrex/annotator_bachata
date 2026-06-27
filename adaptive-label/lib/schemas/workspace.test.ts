import { describe, it, expect } from "vitest";
import {
  FieldType,
  LabelField,
  TimelineMode,
  WorkspaceSchema,
  PRESETS,
} from "@/lib/schemas/workspace";

/** A minimal valid field used as a base for targeted mutation in tests. */
function baseField(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    key: "field_a",
    label: "Field A",
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

/** A minimal valid schema with the given fields. */
function schemaWith(fields: unknown[]) {
  return {
    domain: "test",
    workspaceName: "Test Workspace",
    timelineMode: "beat_grid",
    fields,
    workflowStages: ["draft"],
  };
}

describe("PRESETS", () => {
  it("bachata preset parses and uses the beat_grid timeline", () => {
    const parsed = WorkspaceSchema.parse(PRESETS.bachata);
    expect(parsed.timelineMode).toBe("beat_grid");
    expect(parsed.fields.length).toBeGreaterThanOrEqual(3);
    expect(parsed.fields.length).toBeLessThanOrEqual(24);
  });

  it("sign language preset parses and uses the gloss_segments timeline", () => {
    const parsed = WorkspaceSchema.parse(PRESETS.sign_language);
    expect(parsed.timelineMode).toBe("gloss_segments");
    expect(parsed.fields.length).toBeGreaterThanOrEqual(3);
    expect(parsed.fields.length).toBeLessThanOrEqual(24);
  });

  it("every preset field uses an allowed FieldType and a valid key", () => {
    for (const preset of Object.values(PRESETS)) {
      const keys = new Set<string>();
      for (const field of preset.fields) {
        expect(() => FieldType.parse(field.type)).not.toThrow();
        expect(field.key).toMatch(/^[a-z0-9_]+$/);
        expect(keys.has(field.key)).toBe(false);
        keys.add(field.key);
      }
    }
  });
});

describe("WorkspaceSchema validation", () => {
  it("accepts a minimal valid schema", () => {
    const result = WorkspaceSchema.safeParse(
      schemaWith([
        baseField({ key: "a" }),
        baseField({ key: "b" }),
        baseField({ key: "c" }),
      ]),
    );
    expect(result.success).toBe(true);
  });

  it("rejects an invalid field type", () => {
    const result = WorkspaceSchema.safeParse(
      schemaWith([
        baseField({ key: "a", type: "rich_text" }),
        baseField({ key: "b" }),
        baseField({ key: "c" }),
      ]),
    );
    expect(result.success).toBe(false);
  });

  it("rejects fewer than 3 fields", () => {
    const result = WorkspaceSchema.safeParse(
      schemaWith([baseField({ key: "a" }), baseField({ key: "b" })]),
    );
    expect(result.success).toBe(false);
  });

  it("rejects more than 24 fields", () => {
    const fields = Array.from({ length: 25 }, (_, i) =>
      baseField({ key: `field_${i}` }),
    );
    const result = WorkspaceSchema.safeParse(schemaWith(fields));
    expect(result.success).toBe(false);
  });

  it("rejects a bad field key (uppercase / punctuation)", () => {
    const result = WorkspaceSchema.safeParse(
      schemaWith([
        baseField({ key: "Bad-Key!" }),
        baseField({ key: "b" }),
        baseField({ key: "c" }),
      ]),
    );
    expect(result.success).toBe(false);
  });

  it("rejects duplicate field keys", () => {
    const result = WorkspaceSchema.safeParse(
      schemaWith([
        baseField({ key: "dup" }),
        baseField({ key: "dup" }),
        baseField({ key: "c" }),
      ]),
    );
    expect(result.success).toBe(false);
  });

  it("rejects an invalid timeline mode", () => {
    const schema = schemaWith([
      baseField({ key: "a" }),
      baseField({ key: "b" }),
      baseField({ key: "c" }),
    ]);
    schema.timelineMode = "carousel";
    expect(WorkspaceSchema.safeParse(schema).success).toBe(false);
  });
});

describe("LabelField / TimelineMode", () => {
  it("LabelField defaults required to false when omitted", () => {
    const parsed = LabelField.parse({
      key: "a",
      label: "A",
      help: null,
      type: "text",
      options: null,
      min: null,
      max: null,
      group: null,
    });
    expect(parsed.required).toBe(false);
  });

  it("TimelineMode accepts only the three allowed modes", () => {
    expect(TimelineMode.parse("beat_grid")).toBe("beat_grid");
    expect(TimelineMode.parse("phase_rep")).toBe("phase_rep");
    expect(TimelineMode.parse("gloss_segments")).toBe("gloss_segments");
    expect(TimelineMode.safeParse("other").success).toBe(false);
  });
});
