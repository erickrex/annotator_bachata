import { describe, it, expect } from "vitest";
import fc from "fast-check";

import { buildSearchText, type SearchTextInput } from "@/lib/seed/search-text";
import { assignEmbeddings } from "@/lib/seed/embeddings";
import { EMBEDDING_DIMENSIONS, assertEmbeddingDimension } from "@/lib/db/vector";

/**
 * Property 5 — Embedding/query separation.
 * "No request handler computes an embedding; every stored embedding has the
 * same dimension as the configured model."
 *
 * The embeddings are produced only by the offline seed script (scripts/seed.ts)
 * via `embedMany`; nothing in a request path computes one. Here we test the
 * pure, network-free pieces the seed relies on:
 *   - `buildSearchText` is deterministic and non-empty for any valid clip
 *     (so search text — the embedding input — is stable and well-formed), and
 *   - the dimension guard accepts vectors of the configured dimension and
 *     rejects everything else, both directly (`assertEmbeddingDimension`) and
 *     through the seed flow's enforcement (`assignEmbeddings`, exercised with a
 *     mocked `embedMany` output so no network/DB is needed).
 *
 * Validates: Requirements 5.5, 5.6, 8.4
 */

/** Generator for an attribute value: the JSON-ish shapes seed clips carry. */
const attributeValue: fc.Arbitrary<unknown> = fc.oneof(
  fc.string(),
  fc.integer(),
  fc.boolean(),
  fc.array(fc.string(), { maxLength: 6 }),
);

/** A "valid clip" for search-text purposes: domain is always non-empty. */
const clipArb: fc.Arbitrary<SearchTextInput> = fc.record({
  title: fc.string(),
  domain: fc
    .string({ minLength: 1 })
    .filter((s) => s.trim().length > 0),
  searchAttributes: fc.dictionary(fc.string(), attributeValue, {
    maxKeys: 8,
  }),
});

describe("buildSearchText (Property 5 support)", () => {
  it("is deterministic: equal inputs produce equal output", () => {
    fc.assert(
      fc.property(clipArb, (clip) => {
        const a = buildSearchText(clip);
        // Rebuild from a structurally-identical copy to defeat any reliance on
        // object identity / insertion order.
        const copy: SearchTextInput = {
          title: clip.title,
          domain: clip.domain,
          searchAttributes: { ...clip.searchAttributes },
        };
        const b = buildSearchText(copy);
        expect(a).toBe(b);
      }),
    );
  });

  it("does not depend on attribute insertion order", () => {
    fc.assert(
      fc.property(clipArb, (clip) => {
        const keys = Object.keys(clip.searchAttributes);
        const reversed: Record<string, unknown> = {};
        for (const key of [...keys].reverse()) {
          reversed[key] = clip.searchAttributes[key];
        }
        expect(buildSearchText(clip)).toBe(
          buildSearchText({ ...clip, searchAttributes: reversed }),
        );
      }),
    );
  });

  it("produces a non-empty string for any valid clip (domain present)", () => {
    fc.assert(
      fc.property(clipArb, (clip) => {
        const text = buildSearchText(clip);
        expect(text.length).toBeGreaterThan(0);
        expect(text).toContain(clip.domain.trim());
      }),
    );
  });
});

describe("embedding dimension guard (Property 5)", () => {
  it("accepts vectors of exactly the configured dimension", () => {
    fc.assert(
      fc.property(
        fc.array(fc.double({ noNaN: true, noDefaultInfinity: true }), {
          minLength: EMBEDDING_DIMENSIONS,
          maxLength: EMBEDDING_DIMENSIONS,
        }),
        (vector) => {
          expect(() =>
            assertEmbeddingDimension(vector, EMBEDDING_DIMENSIONS),
          ).not.toThrow();
        },
      ),
    );
  });

  it("rejects vectors whose dimension differs from the configured model", () => {
    fc.assert(
      fc.property(
        fc
          .nat({ max: 4096 })
          .filter((n) => n !== EMBEDDING_DIMENSIONS),
        (length) => {
          const vector = new Array(length).fill(0);
          expect(() =>
            assertEmbeddingDimension(vector, EMBEDDING_DIMENSIONS),
          ).toThrow(/dimension mismatch/i);
        },
      ),
    );
  });
});

describe("assignEmbeddings — seed flow dimension enforcement (Property 5)", () => {
  /** Stand-in for `embedMany`: returns correctly-dimensioned vectors. */
  function mockEmbedMany(values: string[], dim: number): number[][] {
    return values.map((_, i) => new Array(dim).fill((i + 1) / (values.length + 1)));
  }

  it("attaches an embedding to every item when all dimensions match", () => {
    fc.assert(
      fc.property(
        fc.array(fc.record({ id: fc.integer() }), {
          minLength: 1,
          maxLength: 12,
        }),
        (items) => {
          const embeddings = mockEmbedMany(
            items.map(() => ""),
            EMBEDDING_DIMENSIONS,
          );
          const result = assignEmbeddings(items, embeddings, EMBEDDING_DIMENSIONS);
          expect(result).toHaveLength(items.length);
          for (const r of result) {
            expect(r.embedding).toHaveLength(EMBEDDING_DIMENSIONS);
          }
        },
      ),
    );
  });

  it("throws if any embedding has the wrong dimension", () => {
    const items = [{ id: 1 }, { id: 2 }];
    const embeddings = [
      new Array(EMBEDDING_DIMENSIONS).fill(0),
      new Array(EMBEDDING_DIMENSIONS - 1).fill(0), // wrong dimension
    ];
    expect(() =>
      assignEmbeddings(items, embeddings, EMBEDDING_DIMENSIONS),
    ).toThrow(/dimension mismatch/i);
  });

  it("throws if the embedding count does not match the item count", () => {
    const items = [{ id: 1 }, { id: 2 }];
    const embeddings = [new Array(EMBEDDING_DIMENSIONS).fill(0)];
    expect(() =>
      assignEmbeddings(items, embeddings, EMBEDDING_DIMENSIONS),
    ).toThrow(/count mismatch/i);
  });
});
