import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import type { ClipRow, ClipWithDistanceRow } from "@/lib/db";

/**
 * Integration tests for GET /api/clips/:id/similar (Properties 5 & 6).
 *
 * The database is mocked at the `@/lib/db` boundary with an in-memory model of
 * the SQL semantics `findSimilarClips` implements (cosine distance via `<=>`,
 * source-clip exclusion, optional cross-domain filter, ordering by
 * non-decreasing distance). The AI SDK (`ai`) is mocked with spies on its
 * embedding entry points so we can assert the request handler never computes an
 * embedding (Property 5). No real DB or network is touched.
 *
 * Property 6 (Similarity ordering) — Validates: Requirements 5.3, 5.4
 * Property 5 (Embedding/query separation) — Validates: Requirements 5.5, 5.6, 8.4
 */

/* -------------------------------------------------------------------------- */
/* AI SDK spies — the embedding boundary (Property 5)                         */
/* -------------------------------------------------------------------------- */

const embedMock = vi.fn();
const embedManyMock = vi.fn();

vi.mock("ai", () => ({
  embed: (...args: unknown[]) => embedMock(...args),
  embedMany: (...args: unknown[]) => embedManyMock(...args),
}));

/* -------------------------------------------------------------------------- */
/* DB boundary — in-memory model of findSimilarClips' SQL semantics           */
/* -------------------------------------------------------------------------- */

const getClipByIdMock = vi.fn();
const findSimilarClipsMock = vi.fn();

vi.mock("@/lib/db", () => ({
  getClipById: (...args: unknown[]) => getClipByIdMock(...args),
  findSimilarClips: (...args: unknown[]) => findSimilarClipsMock(...args),
}));

async function getHandler() {
  const mod = await import("./route");
  return mod.GET;
}

function getRequest(id: string, query = ""): Request {
  return new Request(`http://localhost/api/clips/${id}/similar${query}`);
}

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

/* -------------------------------------------------------------------------- */
/* Fixtures + an in-memory clip store that mimics the vector query            */
/* -------------------------------------------------------------------------- */

interface FixtureClip {
  id: string;
  project_id: string;
  clip_index: number;
  title: string | null;
  domain: string;
  embedding: number[] | null;
}

function makeClipRow(c: FixtureClip): ClipRow {
  return {
    id: c.id,
    project_id: c.project_id,
    media_asset_id: null,
    clip_index: c.clip_index,
    title: c.title,
    domain: c.domain,
    start_frame: null,
    end_frame: null,
    start_seconds: null,
    end_seconds: null,
    metadata_json: {},
    search_text: null,
    embedding: c.embedding === null ? null : `[${c.embedding.join(",")}]`,
  };
}

/** Cosine distance (`1 - cosine similarity`), matching pgvector's `<=>`. */
function cosineDistance(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return 1 - dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/**
 * Install an in-memory model for a fixture clip set. `getClipById` returns the
 * stored row; `findSimilarClips` reproduces the handler-relevant SQL semantics:
 * exclude the source, skip null embeddings, optional cross-domain filter, rank
 * by non-decreasing cosine distance, and limit.
 */
function installStore(clips: FixtureClip[]) {
  const byId = new Map(clips.map((c) => [c.id, c]));

  getClipByIdMock.mockImplementation(async (id: string) => {
    const c = byId.get(id);
    return c ? makeClipRow(c) : null;
  });

  findSimilarClipsMock.mockImplementation(
    async (
      clipId: string,
      options: { limit?: number; crossDomain?: boolean } = {},
    ): Promise<ClipWithDistanceRow[]> => {
      const limit = options.limit ?? 10;
      const crossDomain = options.crossDomain ?? false;
      const src = byId.get(clipId);
      if (!src || src.embedding === null) return [];

      return clips
        .filter((c) => c.id !== clipId && c.embedding !== null)
        .filter((c) => crossDomain || c.domain === src.domain)
        .map((c) => ({
          ...makeClipRow(c),
          distance: cosineDistance(src.embedding as number[], c.embedding!),
        }))
        .sort((x, y) => x.distance - y.distance)
        .slice(0, limit);
    },
  );
}

/* -------------------------------------------------------------------------- */
/* A small two-domain fixture                                                 */
/* -------------------------------------------------------------------------- */

const CLIPS: FixtureClip[] = [
  // bachata (source is b_src)
  { id: "b_src", project_id: "p_bachata", clip_index: 0, title: "Source step", domain: "bachata", embedding: [1, 0, 0] },
  { id: "b_near", project_id: "p_bachata", clip_index: 1, title: "Near step", domain: "bachata", embedding: [0.9, 0.1, 0] },
  { id: "b_far", project_id: "p_bachata", clip_index: 2, title: "Far step", domain: "bachata", embedding: [0, 0.2, 1] },
  // sign language
  { id: "s_close", project_id: "p_sign", clip_index: 0, title: "Close sign", domain: "sign_language", embedding: [0.8, 0.2, 0.05] },
  { id: "s_far", project_id: "p_sign", clip_index: 1, title: "Far sign", domain: "sign_language", embedding: [-1, 0, 0] },
];

describe("GET /api/clips/:id/similar", () => {
  beforeEach(() => {
    embedMock.mockReset();
    embedManyMock.mockReset();
    getClipByIdMock.mockReset();
    findSimilarClipsMock.mockReset();
    installStore(CLIPS);
  });

  afterEach(() => {
    vi.resetModules();
  });

  /* ---- Property 6: ordering + source exclusion ------------------------- */

  it("returns neighbors ordered by non-decreasing distance (Property 6)", async () => {
    const GET = await getHandler();
    const res = await GET(getRequest("b_src"), ctx("b_src"));
    expect(res.status).toBe(200);

    const body = await res.json();
    const distances = body.results.map((r: { distance: number }) => r.distance);
    for (let i = 1; i < distances.length; i++) {
      expect(distances[i]).toBeGreaterThanOrEqual(distances[i - 1]);
    }
    // The nearest same-domain neighbor ranks first.
    expect(body.results[0].id).toBe("b_near");
  });

  it("excludes the source clip from its own results (Property 6)", async () => {
    const GET = await getHandler();
    const res = await GET(getRequest("b_src"), ctx("b_src"));
    const body = await res.json();

    const ids = body.results.map((r: { id: string }) => r.id);
    expect(ids).not.toContain("b_src");
  });

  /* ---- Cross-domain flag behavior (Req 5.4) ---------------------------- */

  it("restricts to the source domain when crossDomain is unset", async () => {
    const GET = await getHandler();
    const res = await GET(getRequest("b_src"), ctx("b_src"));
    const body = await res.json();

    const domains = new Set(
      body.results.map((r: { domain: string }) => r.domain),
    );
    expect(domains).toEqual(new Set(["bachata"]));
    expect(findSimilarClipsMock).toHaveBeenCalledWith("b_src", {
      limit: 10,
      crossDomain: false,
    });
  });

  it("returns cross-domain matches when crossDomain=true (Req 5.4)", async () => {
    const GET = await getHandler();
    const res = await GET(
      getRequest("b_src", "?crossDomain=true"),
      ctx("b_src"),
    );
    const body = await res.json();

    const domains = new Set(
      body.results.map((r: { domain: string }) => r.domain),
    );
    expect(domains.has("bachata")).toBe(true);
    expect(domains.has("sign_language")).toBe(true);
    // Still globally ordered by distance.
    const distances = body.results.map((r: { distance: number }) => r.distance);
    for (let i = 1; i < distances.length; i++) {
      expect(distances[i]).toBeGreaterThanOrEqual(distances[i - 1]);
    }
  });

  it("honors the limit query param", async () => {
    const GET = await getHandler();
    const res = await GET(
      getRequest("b_src", "?crossDomain=true&limit=2"),
      ctx("b_src"),
    );
    const body = await res.json();
    expect(body.results).toHaveLength(2);
    expect(findSimilarClipsMock).toHaveBeenCalledWith("b_src", {
      limit: 2,
      crossDomain: true,
    });
  });

  /* ---- Property 5: no embedding computed in the handler ---------------- */

  it("never computes an embedding in the request path (Property 5)", async () => {
    const GET = await getHandler();
    await GET(getRequest("b_src", "?crossDomain=true"), ctx("b_src"));

    // The handler ranked clips using the STORED embedding via the query layer…
    expect(findSimilarClipsMock).toHaveBeenCalledTimes(1);
    // …and never invoked any embedding-generation function (Req 5.5/8.4).
    expect(embedMock).not.toHaveBeenCalled();
    expect(embedManyMock).not.toHaveBeenCalled();
  });

  /* ---- Error handling -------------------------------------------------- */

  it("returns an empty result with a message when the clip has no embedding", async () => {
    installStore([
      {
        id: "no_embed",
        project_id: "p_bachata",
        clip_index: 9,
        title: "No embedding",
        domain: "bachata",
        embedding: null,
      },
    ]);
    const GET = await getHandler();
    const res = await GET(getRequest("no_embed"), ctx("no_embed"));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.results).toEqual([]);
    expect(typeof body.message).toBe("string");
    // No embedding computed even on the empty path (Property 5).
    expect(embedMock).not.toHaveBeenCalled();
    expect(embedManyMock).not.toHaveBeenCalled();
    // And we don't run the vector query when there's nothing to rank against.
    expect(findSimilarClipsMock).not.toHaveBeenCalled();
  });

  it("returns 404 for an unknown clip", async () => {
    const GET = await getHandler();
    const res = await GET(getRequest("missing"), ctx("missing"));
    expect(res.status).toBe(404);
  });

  it("returns 400 for an invalid limit", async () => {
    const GET = await getHandler();
    const res = await GET(getRequest("b_src", "?limit=0"), ctx("b_src"));
    expect(res.status).toBe(400);
    expect(findSimilarClipsMock).not.toHaveBeenCalled();
  });
});
