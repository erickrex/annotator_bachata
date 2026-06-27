import { describe, it, expect } from "vitest";
import fc from "fast-check";
import {
  validateAnnotation,
  extraneousValueKeys,
  isValuesSubsetOfSchema,
  type ValidationRule,
} from "@/lib/validation";
import type { LabelField, WorkspaceSchema } from "@/lib/schemas/workspace";

/**
 * Property 4 — Annotation/schema consistency.
 *
 * A submitted annotation satisfies all required/enum/range rules: values that
 * satisfy the rules produce no errors, and values that violate a rule produce
 * the corresponding error. We also assert the related subset invariant: keys in
 * `values` not present in the schema are reported by {@link extraneousValueKeys}
 * (the persisted `values_json` keys must be a subset of schema field keys;
 * enforcement at persistence happens in Task 10.2).
 *
 * Validates: Requirements 4.2, 4.5
 */

const OMIT = Symbol("OMIT");

interface FieldSpec {
  partial: Pick<LabelField, "type" | "required" | "options" | "min" | "max">;
  /** A concrete value that satisfies every rule for this field. */
  validValue: unknown;
  /** Ways to make this field invalid, each tied to the rule it should trip. */
  violations: Array<{ rule: ValidationRule; bad: unknown | typeof OMIT }>;
}

// Non-empty lowercase identifier-ish words (never whitespace-only).
const word = fc
  .array(fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz".split("")), {
    minLength: 1,
    maxLength: 6,
  })
  .map((cs) => cs.join(""));

const optionsArb = fc.uniqueArray(word, { minLength: 1, maxLength: 5 });

// --- Field spec generators -------------------------------------------------

const textRequiredSpec: fc.Arbitrary<FieldSpec> = word.map((w) => ({
  partial: { type: "text", required: true, options: null, min: null, max: null },
  validValue: w + "x",
  violations: [{ rule: "required", bad: OMIT }],
}));

const textOptionalSpec: fc.Arbitrary<FieldSpec> = word.map((w) => ({
  partial: { type: "text", required: false, options: null, min: null, max: null },
  validValue: w,
  violations: [],
}));

const checkboxSpec: fc.Arbitrary<FieldSpec> = fc.boolean().map((b) => ({
  partial: { type: "checkbox", required: b, options: null, min: null, max: null },
  validValue: false, // false is treated as present, satisfies required
  violations: [],
}));

const singleEnumSpec: fc.Arbitrary<FieldSpec> = fc
  .record({
    type: fc.constantFrom("select", "radio") as fc.Arbitrary<"select" | "radio">,
    required: fc.boolean(),
    options: optionsArb,
    pick: fc.nat(),
  })
  .map(({ type, required, options, pick }) => ({
    partial: { type, required, options, min: null, max: null },
    validValue: options[pick % options.length],
    violations: [{ rule: "enum" as const, bad: "__nope_" + options.join("_") }],
  }));

const multiselectSpec: fc.Arbitrary<FieldSpec> = fc
  .record({
    required: fc.boolean(),
    options: optionsArb,
    take: fc.nat(),
  })
  .map(({ required, options, take }) => {
    const k = (take % options.length) + 1; // 1..options.length (non-empty)
    const subset = options.slice(0, k);
    return {
      partial: {
        type: "multiselect" as const,
        required,
        options,
        min: null,
        max: null,
      },
      validValue: subset,
      violations: [
        { rule: "enum" as const, bad: [...subset, "__nope_" + options.join("_")] },
      ],
    };
  });

const rangeSpec: fc.Arbitrary<FieldSpec> = fc
  .record({
    type: fc.constantFrom(
      "number",
      "slider",
      "time_range",
      "timeline_marker",
    ) as fc.Arbitrary<"number" | "slider" | "time_range" | "timeline_marker">,
    required: fc.boolean(),
    lo: fc.integer({ min: -50, max: 50 }),
    span: fc.integer({ min: 1, max: 50 }),
    pick: fc.nat(),
  })
  .map(({ type, required, lo, span, pick }) => {
    const min = lo;
    const max = lo + span;
    const inRange = min + (pick % (span + 1));
    const validValue = type === "time_range" ? [min, max] : inRange;
    const bad = type === "time_range" ? [min - 1, max] : min - 1;
    return {
      partial: { type, required, options: null, min, max },
      validValue,
      violations: [{ rule: "range" as const, bad }],
    };
  });

// Any spec (for filler fields whose valid values must produce no errors).
const anySpec: fc.Arbitrary<FieldSpec> = fc.oneof(
  textRequiredSpec,
  textOptionalSpec,
  checkboxSpec,
  singleEnumSpec,
  multiselectSpec,
  rangeSpec,
);

// Specs that are guaranteed to have at least one violation.
const violatableSpec: fc.Arbitrary<FieldSpec> = fc.oneof(
  textRequiredSpec,
  singleEnumSpec,
  multiselectSpec,
  rangeSpec,
);

function buildSchema(specs: FieldSpec[]): {
  schema: WorkspaceSchema;
  validValues: Record<string, unknown>;
} {
  const fields: LabelField[] = specs.map((s, i) => ({
    key: `f${i}`,
    label: `F${i}`,
    help: null,
    type: s.partial.type,
    required: s.partial.required,
    options: s.partial.options,
    min: s.partial.min,
    max: s.partial.max,
    group: null,
  }));
  const validValues: Record<string, unknown> = {};
  specs.forEach((s, i) => {
    validValues[`f${i}`] = s.validValue;
  });
  return {
    schema: {
      domain: "gen",
      workspaceName: "Gen",
      timelineMode: "beat_grid",
      fields,
      workflowStages: ["draft"],
    },
    validValues,
  };
}

describe("Property 4: annotation/schema consistency", () => {
  it("values satisfying all rules produce no errors", () => {
    fc.assert(
      fc.property(fc.array(anySpec, { minLength: 3, maxLength: 8 }), (specs) => {
        const { schema, validValues } = buildSchema(specs);
        expect(validateAnnotation(schema, validValues)).toEqual([]);
      }),
    );
  });

  it("violating a single rule produces the corresponding error", () => {
    fc.assert(
      fc.property(
        fc.array(anySpec, { minLength: 2, maxLength: 6 }),
        violatableSpec,
        fc.nat(),
        (fillers, target, violationPick) => {
          const specs = [...fillers, target];
          const targetIndex = fillers.length;
          const targetKey = `f${targetIndex}`;
          const { schema, validValues } = buildSchema(specs);

          const violation =
            target.violations[violationPick % target.violations.length];

          const values: Record<string, unknown> = { ...validValues };
          if (violation.bad === OMIT) {
            delete values[targetKey];
          } else {
            values[targetKey] = violation.bad;
          }

          const errors = validateAnnotation(schema, values);
          expect(
            errors.some(
              (e) => e.field === targetKey && e.rule === violation.rule,
            ),
          ).toBe(true);
        },
      ),
    );
  });

  it("reports value keys that are not a subset of the schema field keys", () => {
    fc.assert(
      fc.property(
        fc.array(anySpec, { minLength: 3, maxLength: 8 }),
        fc.boolean(),
        (specs, addExtra) => {
          const { schema, validValues } = buildSchema(specs);
          const values: Record<string, unknown> = { ...validValues };
          if (addExtra) {
            values["__extra__"] = 1; // never a generated field key (f0..fn)
            expect(extraneousValueKeys(schema, values)).toEqual(["__extra__"]);
            expect(isValuesSubsetOfSchema(schema, values)).toBe(false);
          } else {
            expect(extraneousValueKeys(schema, values)).toEqual([]);
            expect(isValuesSubsetOfSchema(schema, values)).toBe(true);
          }
        },
      ),
    );
  });
});
