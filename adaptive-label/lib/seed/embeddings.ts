/**
 * Pure helper that pairs seed items with the embeddings returned by `embedMany`
 * and enforces that every embedding has the configured dimension before any row
 * is written (Property 5 / Requirements 5.6, 8.4).
 *
 * Keeping this separate from `scripts/seed.ts` means the dimension-enforcement
 * logic can be exercised in tests with a *mocked* `embedMany` output — no
 * network, no database. The actual embedding call lives only in the seed script
 * (embeddings are never computed in a request path — Requirement 5.5).
 */

import { EMBEDDING_DIMENSIONS, assertEmbeddingDimension } from "@/lib/db/vector";

/** An item with the embedding attached. */
export type WithEmbedding<T> = T & { embedding: number[] };

/**
 * Attach each embedding to its corresponding item, asserting that the two lists
 * line up and that every vector matches `expectedDimension`.
 *
 * @throws if the counts differ or any embedding has the wrong dimension. A
 *   mismatch is a seed-time bug we want to fail fast on rather than persist a
 *   vector the `vector(N)` column would reject.
 */
export function assignEmbeddings<T>(
  items: ReadonlyArray<T>,
  embeddings: ReadonlyArray<ReadonlyArray<number>>,
  expectedDimension: number = EMBEDDING_DIMENSIONS,
): Array<WithEmbedding<T>> {
  if (items.length !== embeddings.length) {
    throw new Error(
      `Embedding count mismatch: ${items.length} items but ${embeddings.length} embeddings`,
    );
  }
  return items.map((item, index) => {
    const embedding = embeddings[index];
    assertEmbeddingDimension(embedding, expectedDimension);
    return { ...item, embedding: [...embedding] };
  });
}
