import { describe, it, expect, vi } from "vitest";

import { submitAnnotation } from "./annotations";

/**
 * Unit tests for the client submit helper. A fake `fetch` is injected so no
 * real network call is made; we assert the request shape and the discriminated
 * result for success, validation failure, and network error.
 */

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("submitAnnotation (client)", () => {
  it("PUTs to the task endpoint with values and default submitted status", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse(200, { annotation: { id: "a1" } }));

    const result = await submitAnnotation(
      "task 1/with?chars",
      { values: { move_name: "x" } },
      fetchImpl,
    );

    expect(result.ok).toBe(true);
    const [url, init] = fetchImpl.mock.calls[0];
    // Task id is URL-encoded.
    expect(url).toBe("/api/annotations/task%201%2Fwith%3Fchars");
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body)).toEqual({
      values: { move_name: "x" },
      status: "submitted",
    });
  });

  it("returns the persisted annotation on success", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        jsonResponse(200, { annotation: { id: "a1", source: "human" } }),
      );

    const result = await submitAnnotation("t1", { values: {} }, fetchImpl);
    expect(result).toEqual({
      ok: true,
      annotation: { id: "a1", source: "human" },
    });
  });

  it("surfaces 422 validation errors as a failure result", async () => {
    const errors = [
      { field: "move_name", rule: "required", message: "missing" },
    ];
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        jsonResponse(422, { error: "Annotation failed validation.", errors }),
      );

    const result = await submitAnnotation("t1", { values: {} }, fetchImpl);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(422);
      expect(result.errors).toEqual(errors);
      expect(result.message).toBe("Annotation failed validation.");
    }
  });

  it("returns a generic failure when the network throws", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("offline"));

    const result = await submitAnnotation("t1", { values: {} }, fetchImpl);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(0);
      expect(result.errors).toEqual([]);
    }
  });

  it("forwards an explicit draft status", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse(200, { annotation: { id: "a1" } }));

    await submitAnnotation(
      "t1",
      { values: { move_name: "wip" }, status: "draft" },
      fetchImpl,
    );
    const [, init] = fetchImpl.mock.calls[0];
    expect(JSON.parse(init.body).status).toBe("draft");
  });
});
