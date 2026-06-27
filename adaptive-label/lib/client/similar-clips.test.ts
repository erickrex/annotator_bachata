import { describe, it, expect, vi } from "vitest";

import { fetchSimilarClips } from "./similar-clips";

/**
 * Unit tests for the `fetchSimilarClips` client helper. A fake `fetch` is
 * injected so no real network is used; we assert URL construction (crossDomain
 * + limit query params) and the success / no-embedding / error result mapping.
 */

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const NEIGHBORS = [
  { id: "b1", projectId: "p", clipIndex: 1, title: "One", domain: "bachata", distance: 0.1 },
  { id: "b2", projectId: "p", clipIndex: 2, title: "Two", domain: "bachata", distance: 0.3 },
];

describe("fetchSimilarClips", () => {
  it("builds a plain URL with no query params by default", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ results: NEIGHBORS, crossDomain: false }),
    );

    const result = await fetchSimilarClips("clip 1", {}, fetchImpl);

    expect(fetchImpl).toHaveBeenCalledWith("/api/clips/clip%201/similar", {
      method: "GET",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.results).toHaveLength(2);
      expect(result.crossDomain).toBe(false);
    }
  });

  it("encodes crossDomain and limit query params", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ results: NEIGHBORS, crossDomain: true }),
    );

    await fetchSimilarClips("c1", { crossDomain: true, limit: 5 }, fetchImpl);

    expect(fetchImpl).toHaveBeenCalledWith(
      "/api/clips/c1/similar?crossDomain=true&limit=5",
      { method: "GET" },
    );
  });

  it("surfaces the no-embedding message with empty results", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ results: [], crossDomain: false, message: "no embedding" }),
    );

    const result = await fetchSimilarClips("c1", {}, fetchImpl);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.results).toEqual([]);
      expect(result.message).toBe("no embedding");
    }
  });

  it("maps a non-2xx response to a failure result", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ error: "Clip x not found." }, 404),
    );

    const result = await fetchSimilarClips("x", {}, fetchImpl);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(404);
      expect(result.message).toBe("Clip x not found.");
    }
  });

  it("maps a network error to a failure result", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("offline");
    });

    const result = await fetchSimilarClips("c1", {}, fetchImpl);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(0);
    }
  });
});
