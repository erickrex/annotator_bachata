import {
  findSimilarClips,
  getClipById,
  type ClipWithDistanceRow,
} from "@/lib/db";

/**
 * GET /api/clips/:id/similar (Requirements 5.3, 5.4, 5.5, 8.4 / Properties 5, 6).
 *
 * Returns the nearest clips to the source clip by cosine distance, using the
 * source clip's *stored* embedding. This handler NEVER computes an embedding
 * (Req 5.5/8.4): it only reads stored vectors through the typed query layer
 * (`findSimilarClips`), where the `<=>` cosine-distance query runs against the
 * HNSW index, excludes the source clip, and orders by non-decreasing distance
 * (Property 6).
 *
 * Query params:
 * - `crossDomain` (`true`/`1` to enable): when set, return matches across all
 *   domains; otherwise restrict to the source clip's own domain (Req 5.4).
 * - `limit` (1–100, default 10): maximum number of neighbors.
 *
 * Outcomes:
 * - success: 200 `{ sourceClipId, crossDomain, limit, results }` ordered by
 *   non-decreasing distance, never including the source clip.
 * - source clip has no embedding: 200 `{ ..., results: [], message }` rather
 *   than an error (design.md → Error Handling).
 * - unknown clip: 404.
 * - invalid `limit`: 400.
 */
export const dynamic = "force-dynamic";

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;

/** Parse a truthy flag query param (`true`/`1`/`yes`, case-insensitive). */
function parseFlag(value: string | null): boolean {
  if (value === null) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "yes";
}

interface SimilarClipResult {
  id: string;
  projectId: string;
  clipIndex: number;
  title: string | null;
  domain: string;
  distance: number;
}

/** Project a DB row to the public response shape (no embedding is exposed). */
function toResult(row: ClipWithDistanceRow): SimilarClipResult {
  return {
    id: row.id,
    projectId: row.project_id,
    clipIndex: row.clip_index,
    title: row.title,
    domain: row.domain,
    // pg may return a numeric distance as a string; normalize to a number.
    distance: Number(row.distance),
  };
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const { searchParams } = new URL(request.url);

  const crossDomain = parseFlag(searchParams.get("crossDomain"));

  let limit = DEFAULT_LIMIT;
  const limitParam = searchParams.get("limit");
  if (limitParam !== null) {
    const parsed = Number(limitParam);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_LIMIT) {
      return Response.json(
        { error: `'limit' must be an integer between 1 and ${MAX_LIMIT}.` },
        { status: 400 },
      );
    }
    limit = parsed;
  }

  // Read the source clip's STORED data (never compute an embedding here).
  const source = await getClipById(id);
  if (!source) {
    return Response.json({ error: `Clip ${id} not found.` }, { status: 404 });
  }

  // A clip without a seeded embedding has no neighbors to rank against; return
  // an empty result with a clear message rather than erroring (Error Handling).
  if (source.embedding === null) {
    return Response.json(
      {
        sourceClipId: id,
        crossDomain,
        limit,
        results: [],
        message:
          "This clip has no embedding yet, so similar clips can't be computed.",
      },
      { status: 200 },
    );
  }

  // Stored-embedding cosine-distance query (HNSW): excludes the source clip and
  // orders by non-decreasing distance inside the query layer (Property 6).
  const rows = await findSimilarClips(id, { limit, crossDomain });

  return Response.json(
    {
      sourceClipId: id,
      crossDomain,
      limit,
      results: rows.map(toResult),
    },
    { status: 200 },
  );
}
