import {
  AnnotationValidationError,
  SchemaNotFoundError,
  submitAnnotation,
  TaskNotFoundError,
  type SubmitStatus,
} from "@/lib/db";

/**
 * PUT /api/annotations/:taskId (Requirements 4.1, 4.4, 4.5 / Property 4).
 *
 * Validates the submitted annotation values against the task's active schema
 * and, on success, persists them to `annotations` with source `human` and the
 * resolving schema version. Validation failures (including value keys outside
 * the schema) block the write and return the failing rules.
 *
 * Request body: `{ values: Record<string, unknown>, status?: 'draft' | 'submitted' }`.
 * `status` defaults to `submitted`; `draft` saves work in progress.
 *
 * Outcomes:
 * - success: 200 `{ annotation }` (the persisted row).
 * - validation failure: 422 `{ error, errors: { field, rule, message }[] }`,
 *   nothing persisted (Req 4.3).
 * - unknown task or unresolvable schema: 404.
 * - bad request (non-JSON / missing `values` / invalid `status`): 400.
 */
export const dynamic = "force-dynamic";

interface SubmitAnnotationBody {
  values?: unknown;
  status?: unknown;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ taskId: string }> },
) {
  const { taskId } = await context.params;

  let body: SubmitAnnotationBody;
  try {
    body = (await request.json()) as SubmitAnnotationBody;
  } catch {
    return Response.json(
      { error: "Request body must be valid JSON." },
      { status: 400 },
    );
  }

  if (!isPlainObject(body.values)) {
    return Response.json(
      { error: "A 'values' object is required." },
      { status: 400 },
    );
  }

  let status: SubmitStatus = "submitted";
  if (body.status !== undefined) {
    if (body.status !== "draft" && body.status !== "submitted") {
      return Response.json(
        { error: "'status' must be 'draft' or 'submitted'." },
        { status: 400 },
      );
    }
    status = body.status;
  }

  try {
    const annotation = await submitAnnotation(taskId, {
      values: body.values,
      status,
    });
    return Response.json({ annotation }, { status: 200 });
  } catch (error) {
    if (error instanceof AnnotationValidationError) {
      return Response.json(
        { error: "Annotation failed validation.", errors: error.errors },
        { status: 422 },
      );
    }
    if (
      error instanceof TaskNotFoundError ||
      error instanceof SchemaNotFoundError
    ) {
      return Response.json({ error: error.message }, { status: 404 });
    }
    throw error;
  }
}
