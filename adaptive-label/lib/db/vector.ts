/**
 * pgvector serialization helpers.
 *
 * pgvector accepts and returns vectors as a bracketed, comma-separated text
 * literal (e.g. `[0.1,0.2,0.3]`). These pure helpers convert between that wire
 * format and `number[]`, with no database dependency, so they can be unit
 * tested in isolation and reused by both the query layer and the seed script.
 */

/** The embedding dimension stored on `clips.embedding` (`vector(1536)`). */
export const EMBEDDING_DIMENSIONS = 1536;

/**
 * Serialize a numeric vector into the pgvector text literal `[a,b,c]`.
 *
 * @throws if any component is not a finite number (NaN/Infinity would silently
 *   corrupt the stored vector).
 */
export function toVectorLiteral(values: ReadonlyArray<number>): string {
  for (const value of values) {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new Error(
        `Cannot serialize vector: component is not a finite number (${String(value)})`,
      );
    }
  }
  return `[${values.join(",")}]`;
}

/**
 * Parse a pgvector text literal (`[a,b,c]`) back into `number[]`.
 *
 * Returns `null` for SQL NULL (a clip without an embedding). Throws on a
 * malformed literal so corruption surfaces loudly rather than as silent zeros.
 */
export function parseVector(literal: string | null | undefined): number[] | null {
  if (literal === null || literal === undefined) {
    return null;
  }
  const trimmed = literal.trim();
  if (trimmed === "" || trimmed === "[]") {
    return [];
  }
  if (!trimmed.startsWith("[") || !trimmed.endsWith("]")) {
    throw new Error(`Malformed vector literal: ${literal}`);
  }
  return trimmed
    .slice(1, -1)
    .split(",")
    .map((part) => {
      const n = Number(part.trim());
      if (!Number.isFinite(n)) {
        throw new Error(`Malformed vector component "${part}" in: ${literal}`);
      }
      return n;
    });
}

/**
 * Assert an embedding has the expected dimension before it is stored. Embedding
 * dimension must match the column (`vector(1536)`) and the configured model
 * (Requirement 5.6); a mismatch is a seed-time bug we want to fail fast on.
 */
export function assertEmbeddingDimension(
  values: ReadonlyArray<number>,
  expected: number = EMBEDDING_DIMENSIONS,
): void {
  if (values.length !== expected) {
    throw new Error(
      `Embedding dimension mismatch: got ${values.length}, expected ${expected}`,
    );
  }
}
