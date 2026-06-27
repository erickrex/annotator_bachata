import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { FieldType, WorkspaceSchema } from "@/lib/schemas/workspace";

/**
 * Property 1: Schema validity
 *
 * Any schema accepted for activation parses against `WorkspaceSchema`; field
 * `key`s are unique within a schema and match `^[a-z0-9_]+$`; field count is
 * between 3 and 24.
 *
 * Validates: Requirements 1.2, 1.6
 */

const KEY_REGEX = /^[a-z0-9_]+$/;
const KEY_CHARS = "abcdefghijklmnopqrstuvwxyz0123456789_".split("");
const FIELD_TYPES = FieldType.options;
const TIMELINE_MODES = ["beat_grid", "phase_rep", "gloss_segments"] as const;

/** A non-empty key matching `^[a-z0-9_]+$`. */
const keyArb = fc
  .array(fc.constantFrom(...KEY_CHARS), { minLength: 1, maxLength: 12 })
  .map((chars) => chars.join(""));

const nullableInt = fc.option(fc.integer({ min: -1000, max: 1000 }), {
  nil: null,
});

/** A field generator parameterized by a (unique) key. */
function fieldArb(key: string) {
  return fc.record({
    key: fc.constant(key),
    label: fc.string(),
    help: fc.option(fc.string(), { nil: null }),
    type: fc.constantFrom(...FIELD_TYPES),
    required: fc.boolean(),
    options: fc.option(fc.array(fc.string(), { maxLength: 6 }), { nil: null }),
    min: nullableInt,
    max: nullableInt,
    group: fc.option(fc.string(), { nil: null }),
  });
}

/** A generator for valid WorkspaceSchema objects (3..24 unique-keyed fields). */
const validSchemaArb = fc
  .uniqueArray(keyArb, { minLength: 3, maxLength: 24 })
  .chain((keys) =>
    fc.record({
      domain: fc.string(),
      workspaceName: fc.string(),
      timelineMode: fc.constantFrom(...TIMELINE_MODES),
      fields: fc.tuple(...keys.map((k) => fieldArb(k))),
      workflowStages: fc.array(fc.string(), { maxLength: 5 }),
    }),
  );

describe("Property 1: Schema validity", () => {
  it("any generated valid schema parses and satisfies the invariants", () => {
    fc.assert(
      fc.property(validSchemaArb, (schema) => {
        const result = WorkspaceSchema.safeParse(schema);
        expect(result.success).toBe(true);

        // Field count between 3 and 24.
        expect(schema.fields.length).toBeGreaterThanOrEqual(3);
        expect(schema.fields.length).toBeLessThanOrEqual(24);

        // Keys are unique and match the allowed pattern.
        const keys = schema.fields.map((f) => f.key);
        expect(new Set(keys).size).toBe(keys.length);
        for (const key of keys) {
          expect(key).toMatch(KEY_REGEX);
        }
      }),
    );
  });

  it("rejects schemas with duplicate field keys", () => {
    fc.assert(
      fc.property(validSchemaArb, (schema) => {
        // Force a duplicate by copying the first field's key onto the second.
        const dup = {
          ...schema,
          fields: schema.fields.map((f, i) =>
            i === 1 ? { ...f, key: schema.fields[0].key } : f,
          ),
        };
        expect(WorkspaceSchema.safeParse(dup).success).toBe(false);
      }),
    );
  });

  it("rejects schemas with a field count outside 3..24", () => {
    const tooFew = fc
      .uniqueArray(keyArb, { minLength: 0, maxLength: 2 })
      .chain((keys) =>
        fc.record({
          domain: fc.constant("d"),
          workspaceName: fc.constant("w"),
          timelineMode: fc.constantFrom(...TIMELINE_MODES),
          fields: keys.length
            ? fc.tuple(...keys.map((k) => fieldArb(k)))
            : fc.constant([]),
          workflowStages: fc.constant([] as string[]),
        }),
      );

    fc.assert(
      fc.property(tooFew, (schema) => {
        expect(WorkspaceSchema.safeParse(schema).success).toBe(false);
      }),
    );
  });

  it("rejects schemas whose field keys violate the pattern", () => {
    const badKey = fc
      .string({ minLength: 1 })
      .filter((s) => !KEY_REGEX.test(s));

    fc.assert(
      fc.property(validSchemaArb, badKey, (schema, bad) => {
        const mutated = {
          ...schema,
          fields: schema.fields.map((f, i) =>
            i === 0 ? { ...f, key: bad } : f,
          ),
        };
        expect(WorkspaceSchema.safeParse(mutated).success).toBe(false);
      }),
    );
  });
});
