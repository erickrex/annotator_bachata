/**
 * Client-side helper for fetching similar clips
 * (`GET /api/clips/:id/similar`).
 *
 * Wraps the network call so UI components don't deal with `fetch`/status-code
 * branching directly. Returns a discriminated result the panel can switch on:
 * a success carries the ordered neighbors (and an optional message for the
 * no-embedding case); a failure carries a status and message.
 *
 * `fetchImpl` is injectable so the helper can be unit-tested without a real
 * network (no live HTTP is performed in tests). No embedding is ever computed
 * here or in the handler it calls (Req 5.5/8.4).
 */

export interface SimilarClip {
  id: string;
  projectId: string;
  clipIndex: number;
  title: string | null;
  domain: string;
  /** Cosine distance (`<=>`); smaller is more similar. */
  distance: number;
}

export interface FetchSimilarClipsRequest {
  /** Include matches from other domains (Req 5.4). Defaults to false. */
  crossDomain?: boolean;
  /** Maximum neighbors to return (1–100). */
  limit?: number;
}

export type FetchSimilarClipsResult =
  | {
      ok: true;
      results: SimilarClip[];
      crossDomain: boolean;
      /** Present when the source clip has no embedding (empty results). */
      message?: string;
    }
  | { ok: false; status: number; message: string };

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/**
 * GET the nearest clips for `clipId`. Resolves to a tagged result rather than
 * throwing on a non-2xx response, so callers handle the no-embedding/empty and
 * error cases as data. Network/parse errors resolve to a generic failure.
 */
export async function fetchSimilarClips(
  clipId: string,
  request: FetchSimilarClipsRequest = {},
  fetchImpl: FetchLike = fetch,
): Promise<FetchSimilarClipsResult> {
  const params = new URLSearchParams();
  if (request.crossDomain) params.set("crossDomain", "true");
  if (request.limit !== undefined) params.set("limit", String(request.limit));
  const queryString = params.toString();
  const url = `/api/clips/${encodeURIComponent(clipId)}/similar${
    queryString ? `?${queryString}` : ""
  }`;

  let response: Response;
  try {
    response = await fetchImpl(url, { method: "GET" });
  } catch {
    return {
      ok: false,
      status: 0,
      message: "Could not reach the server. Please try again.",
    };
  }

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  const data = (payload ?? {}) as {
    results?: SimilarClip[];
    crossDomain?: boolean;
    message?: string;
    error?: string;
  };

  if (response.ok) {
    return {
      ok: true,
      results: Array.isArray(data.results) ? data.results : [],
      crossDomain: Boolean(data.crossDomain),
      message: data.message,
    };
  }

  return {
    ok: false,
    status: response.status,
    message: data.error ?? "Failed to load similar clips.",
  };
}
