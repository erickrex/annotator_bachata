import {
  generateWorkspaceSchema,
  SchemaValidationError,
  selectFallbackPreset,
} from "@/lib/ai";

/**
 * POST /api/generate-schema (Requirement 1.1–1.5, 1.9, 8.1).
 *
 * Accepts a free-text dataset description and returns a validated
 * `WorkspaceSchema`. This endpoint does NOT persist anything — activation /
 * immutable versioning is handled separately (Task 7.3 / Requirement 1.7).
 *
 * Outcomes:
 * - success: 200 `{ source: "model", schema }`.
 * - model output fails Zod validation: 422 `{ error, issues }`, nothing
 *   persisted (Requirement 1.3 / 8.1).
 * - provider/network failure: 200 `{ source: "fallback", fallback: true,
 *   schema }` using the matching deterministic preset (Requirement 1.9).
 * - bad request (missing/blank description): 400.
 */
export const dynamic = "force-dynamic";

interface GenerateSchemaBody {
  description?: unknown;
}

export async function POST(request: Request) {
  let body: GenerateSchemaBody;
  try {
    body = (await request.json()) as GenerateSchemaBody;
  } catch {
    return Response.json(
      { error: "Request body must be valid JSON." },
      { status: 400 },
    );
  }

  const description =
    typeof body.description === "string" ? body.description.trim() : "";
  if (description.length === 0) {
    return Response.json(
      { error: "A non-empty 'description' string is required." },
      { status: 400 },
    );
  }

  try {
    const schema = await generateWorkspaceSchema(description);
    return Response.json({ source: "model", schema });
  } catch (error) {
    // Malformed model output — reject with a structured error and persist
    // nothing (Req 1.3 / 8.1). No preset fallback here: the caller asked for a
    // schema and the model returned something invalid, which we surface.
    if (error instanceof SchemaValidationError) {
      return Response.json(
        {
          error: "Generated schema failed validation.",
          issues: error.issues,
        },
        { status: 422 },
      );
    }

    // Provider/network failure — fall back to the matching deterministic preset
    // so the workflow does not hard-fail (Req 1.9). The fallback honours the
    // domain → timeline mapping (rhythmic → beat_grid, sign language →
    // gloss_segments).
    const schema = selectFallbackPreset(description);
    const message =
      error instanceof Error ? error.message : "unknown generation error";
    return Response.json({
      source: "fallback",
      fallback: true,
      reason: message,
      schema,
    });
  }
}
