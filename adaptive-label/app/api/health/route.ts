import { ping } from "@/lib/db";

/**
 * Health check (Requirement 7.1 / 7.2 / 7.3).
 *
 * Runs a trivial `SELECT 1` against Aurora through the pooled client to prove
 * the deployed app can read from the primary backend. This handler must never
 * be cached — it has to reflect live connectivity on every call.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const startedAt = Date.now();
  try {
    const ok = await ping();
    const latencyMs = Date.now() - startedAt;

    if (!ok) {
      return Response.json(
        { status: "error", db: "unexpected_result", latencyMs },
        { status: 503 },
      );
    }

    return Response.json({ status: "ok", db: "up", latencyMs });
  } catch (error) {
    const latencyMs = Date.now() - startedAt;
    const message =
      error instanceof Error ? error.message : "unknown database error";

    return Response.json(
      { status: "error", db: "down", latencyMs, error: message },
      { status: 503 },
    );
  }
}
