import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * Tests for the /api/health route handler.
 *
 * - Success path: the DB ping resolves -> 200 { status: "ok", db: "up" }.
 * - Unexpected result: ping resolves false -> 503 { db: "unexpected_result" }.
 * - Failure path: ping throws (e.g. Aurora unreachable / no DATABASE_URL) ->
 *   503 { status: "error", db: "down" }. This is exercised both via a thrown
 *   error and via the real "no env configured" case.
 */

const pingMock = vi.fn();

vi.mock("@/lib/db", () => ({
  ping: () => pingMock(),
}));

async function getHandler() {
  const mod = await import("./route");
  return mod.GET;
}

describe("GET /api/health", () => {
  beforeEach(() => {
    pingMock.mockReset();
  });

  afterEach(() => {
    vi.resetModules();
  });

  it("returns 200 and status ok when the database responds", async () => {
    pingMock.mockResolvedValue(true);
    const GET = await getHandler();

    const res = await GET();
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.db).toBe("up");
    expect(typeof body.latencyMs).toBe("number");
  });

  it("returns 503 when the database returns an unexpected result", async () => {
    pingMock.mockResolvedValue(false);
    const GET = await getHandler();

    const res = await GET();
    expect(res.status).toBe(503);

    const body = await res.json();
    expect(body.status).toBe("error");
    expect(body.db).toBe("unexpected_result");
  });

  it("returns 503 and reports the error when the database is unreachable", async () => {
    pingMock.mockRejectedValue(new Error("connection refused"));
    const GET = await getHandler();

    const res = await GET();
    expect(res.status).toBe(503);

    const body = await res.json();
    expect(body.status).toBe("error");
    expect(body.db).toBe("down");
    expect(body.error).toContain("connection refused");
  });
});
