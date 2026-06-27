import {
  activateWorkspaceSchema,
  ProjectNotFoundError,
  SchemaActivationValidationError,
} from "@/lib/db";

/**
 * POST /api/projects/:id/activate-schema (Requirement 1.7 / Property 2).
 *
 * Persists a validated `WorkspaceSchema` as the project's next immutable
 * schema version: one `label_schemas` row (status `active`, recording the
 * originating generation prompt and `activated_at`) plus one `label_fields`
 * row per field (with `order_index` by array position). The previously-active
 * version is retired via a status-only update; no existing version's fields
 * are ever mutated.
 *
 * Request body: `{ schema: WorkspaceSchema, generationPrompt?: string }`.
 *
 * Outcomes:
 * - success: 201 `{ schemaId, version, status, timelineMode, fieldCount }`.
 * - schema fails validation: 422 `{ error, issues }`, nothing persisted
 *   (Requirement 1.3 / 8.1).
 * - unknown project: 404.
 * - bad request (non-JSON / missing schema): 400.
 */
export const dynamic = "force-dynamic";

interface ActivateSchemaBody {
  schema?: unknown;
  generationPrompt?: unknown;
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id: projectId } = await context.params;

  let body: ActivateSchemaBody;
  try {
    body = (await request.json()) as ActivateSchemaBody;
  } catch {
    return Response.json(
      { error: "Request body must be valid JSON." },
      { status: 400 },
    );
  }

  if (body.schema === undefined || body.schema === null) {
    return Response.json(
      { error: "A 'schema' object is required." },
      { status: 400 },
    );
  }

  // Accept an optional generation prompt; ignore non-string values.
  const generationPrompt =
    typeof body.generationPrompt === "string" ? body.generationPrompt : null;

  try {
    const { schema, fields } = await activateWorkspaceSchema(projectId, {
      schema: body.schema,
      generationPrompt,
    });

    return Response.json(
      {
        schemaId: schema.id,
        version: schema.version,
        status: schema.status,
        timelineMode: schema.timeline_mode,
        fieldCount: fields.length,
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof SchemaActivationValidationError) {
      return Response.json(
        { error: "Schema failed validation.", issues: error.issues },
        { status: 422 },
      );
    }
    if (error instanceof ProjectNotFoundError) {
      return Response.json(
        { error: `Project not found: ${projectId}` },
        { status: 404 },
      );
    }
    throw error;
  }
}
