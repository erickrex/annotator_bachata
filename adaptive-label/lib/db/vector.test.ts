import { describe, it, expect } from "vitest";
import fc from "fast-check";

import {
  EMBEDDING_DIMENSIONS,
  assertEmbeddingDimension,
  parseVector,
  toVectorLiteral,
} from "@/lib/db/vector";

describe("toVectorLiteral", () => {
  it("serializes a numeric vector into a bracketed literal", () => {
    expect(toVectorLiteral([0.1, 0.2, 0.3])).toBe("[0.1,0.2,0.3]");
  });

  it("serializes an empty vector", () => {
    expect(toVectorLiteral([])).toBe("[]");
  });

  it("throws on a non-finite component", () => {
    expect(() => toVectorLiteral([1, Number.NaN])).toThrow();
    expect(() => toVectorLiteral([1, Number.POSITIVE_INFINITY])).toThrow();
  });
});

describe("parseVector", () => {
  it("returns null for SQL NULL", () => {
    expect(parseVector(null)).toBeNull();
    expect(parseVector(undefined)).toBeNull();
  });

  it("parses a bracketed literal back into numbers", () => {
    expect(parseVector("[0.1,0.2,0.3]")).toEqual([0.1, 0.2, 0.3]);
  });

  it("parses an empty vector", () => {
    expect(parseVector("[]")).toEqual([]);
    expect(parseVector("")).toEqual([]);
  });

  it("throws on a malformed literal", () => {
    expect(() => parseVector("0.1,0.2")).toThrow();
    expect(() => parseVector("[0.1,abc]")).toThrow();
  });
});

describe("toVectorLiteral / parseVector round-trip", () => {
  it("round-trips any finite vector (property)", () => {
    fc.assert(
      fc.property(
        fc.array(fc.float({ noNaN: true, noDefaultInfinity: true })),
        (values) => {
          const finite = values.filter((v) => Number.isFinite(v));
          const literal = toVectorLiteral(finite);
          const parsed = parseVector(literal);
          expect(parsed).not.toBeNull();
          expect(parsed).toHaveLength(finite.length);
          // Number(String(x)) is exact for JS doubles, so values match.
          // Negative zero serializes as "0" (Array.join) and parses back as +0;
          // -0 and +0 are numerically equal, so normalize -0 -> +0 before the
          // deep comparison (fast-check's deep equality distinguishes the two).
          const expected = finite.map((v) => (Object.is(v, -0) ? 0 : v));
          expect(parsed).toEqual(expected);
        },
      ),
    );
  });
});

describe("assertEmbeddingDimension", () => {
  it("accepts a vector of the expected dimension", () => {
    expect(() =>
      assertEmbeddingDimension(new Array(EMBEDDING_DIMENSIONS).fill(0)),
    ).not.toThrow();
  });

  it("throws on a dimension mismatch", () => {
    expect(() => assertEmbeddingDimension([1, 2, 3])).toThrow(
      /dimension mismatch/i,
    );
  });

  it("honors a custom expected dimension", () => {
    expect(() => assertEmbeddingDimension([1, 2, 3], 3)).not.toThrow();
  });
});
