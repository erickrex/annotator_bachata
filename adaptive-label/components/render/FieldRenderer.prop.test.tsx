import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import fc from "fast-check";

import { FieldRenderer } from "@/components/render/FieldRenderer";
import { FieldType, type LabelField } from "@/lib/schemas/workspace";

/**
 * Property 3: Render totality
 *
 * For any validated schema, the renderer produces UI without throwing and
 * without executing any generated string; unknown field types are skipped, not
 * run.
 *
 * Validates: Requirements 2.2, 2.3, 8.2, 8.3
 */

const KNOWN_TYPES = FieldType.options;
const KNOWN_SET = new Set<string>(KNOWN_TYPES);

/**
 * A sentinel payload that, if a generated string were ever executed as code or
 * injected as raw HTML, would set a global flag. The renderer must treat all
 * schema strings as inert text, so this flag must never flip.
 */
const PWN_PAYLOAD =
  "<img src=x onerror=\"window.__pwned=true\">';eval('window.__pwned=true')";

afterEach(() => {
  cleanup();
  delete (globalThis as Record<string, unknown>).__pwned;
});

const KEY_CHARS = "abcdefghijklmnopqrstuvwxyz0123456789_".split("");
const keyArb = fc
  .array(fc.constantFrom(...KEY_CHARS), { minLength: 1, maxLength: 12 })
  .map((chars) => chars.join(""));

/** Strings (with a payload skew) that are NOT valid field types. */
const garbageTypeArb = fc
  .oneof(
    fc.string({ minLength: 1, maxLength: 20 }),
    fc.constantFrom(
      "rich_text",
      "video",
      "__proto__",
      "constructor",
      "function",
      "eval",
      PWN_PAYLOAD,
      "",
    ),
  )
  .filter((s) => !KNOWN_SET.has(s));

/** Label/help/option strings, skewed to include the pwn payload sometimes. */
const textArb = fc.oneof(fc.string(), fc.constant(PWN_PAYLOAD));

/** A field with an arbitrary `type` (known or garbage) and possibly hostile strings. */
const anyFieldArb = fc
  .record({
    key: keyArb,
    label: textArb,
    help: fc.option(textArb, { nil: null }),
    type: fc.oneof(fc.constantFrom(...KNOWN_TYPES), garbageTypeArb),
    required: fc.boolean(),
    options: fc.option(fc.array(textArb, { maxLength: 6 }), { nil: null }),
    min: fc.option(fc.integer({ min: -1000, max: 1000 }), { nil: null }),
    max: fc.option(fc.integer({ min: -1000, max: 1000 }), { nil: null }),
    group: fc.option(fc.string(), { nil: null }),
  })
  .map((f) => f as unknown as LabelField);

describe("Property 3: Render totality", () => {
  it("renders any single field without throwing; unknown types are skipped, never executed", () => {
    fc.assert(
      fc.property(anyFieldArb, (field) => {
        delete (globalThis as Record<string, unknown>).__pwned;

        let container: HTMLElement | null = null;
        // The renderer must never throw for any field shape.
        expect(() => {
          ({ container } = render(
            <FieldRenderer field={field} value={undefined} onChange={() => {}} />,
          ));
        }).not.toThrow();

        const isKnown = KNOWN_SET.has(field.type as string);
        if (isKnown) {
          // A known type produces UI.
          expect(container!.firstChild).not.toBeNull();
        } else {
          // An unknown/garbage type is skipped: nothing is rendered, and no
          // component was executed for it.
          expect(container!.firstChild).toBeNull();
        }

        // No generated string was ever executed or injected as live HTML.
        expect((globalThis as Record<string, unknown>).__pwned).toBeUndefined();

        cleanup();
      }),
      { numRuns: 200 },
    );
  });

  it("renders a whole field array (valid schema with injected garbage types) without throwing; only known types produce output", () => {
    const fieldsArb = fc.array(anyFieldArb, { minLength: 1, maxLength: 24 });

    fc.assert(
      fc.property(fieldsArb, (fields) => {
        delete (globalThis as Record<string, unknown>).__pwned;

        let container: HTMLElement | null = null;
        expect(() => {
          ({ container } = render(
            <div data-testid="form">
              {fields.map((field, i) => (
                <FieldRenderer
                  key={i}
                  field={field}
                  value={undefined}
                  onChange={() => {}}
                />
              ))}
            </div>,
          ));
        }).not.toThrow();

        // The number of rendered field wrappers equals the number of known-type
        // fields: unknown types were skipped, not rendered or run.
        const knownCount = fields.filter((f) =>
          KNOWN_SET.has(f.type as string),
        ).length;
        const root = container!.querySelector('[data-testid="form"]')!;
        expect(root.childElementCount).toBe(knownCount);

        expect((globalThis as Record<string, unknown>).__pwned).toBeUndefined();

        cleanup();
      }),
      { numRuns: 100 },
    );
  });
});
