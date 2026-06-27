import {
  exportProjectAnnotations,
  ProjectNotFoundError,
  UnsupportedExportFormatError,
} from "@/lib/export/export-annotations";

/**
 * POST /api/projects/:id/export?format=jsonl
 * (Requirements 6.1, 6.2, 6.3, 6.4 / Property 7 — Export fidelity).
 *
 * Exports a project's annotations as a downloadable artifact. For
 * `format=jsonl` the body is newline-delimited JSON: one record per line,
 * each including the clip reference, the schema version, the annotation field
 * values, and the annotation status (Req 6.1/6.2). The request is recorded in
 * the `exports` table (Req 6.4) and returned as a download with an
 * `application/x-ndjson` content type and an attachment filename (Req 6.3).
 *
 * Query / body params:
 * - `format` (required): only `jsonl` is supported here (CSV / project_json
 *   are Task 17). An unsupported format returns 400.
 * - `status` (optional): limit the export to annotations with this status
 *   (e.g. `submitted`, `approved`). Omitted means all statuses.
 *
 * Parameters may be supplied as query string values or in a JSON body; the
 * query string takes precedence when both are present.
 *
 * Outcomes:
 * - success: 200 with the JSONL body, `Content-Type: application/x-ndjson`,
 *   a `Content-Disposition: attachment` filename, and an `X-Export-Id` /
 *   `X-Export-Record-Count` header for the recorded export row.
 * - unsupported / missing format: 400.
 * - unknown project: 404.
 */
export const dynamic = "force-dynamic";

interface ExportBody {
  format?: unknown;
  status?: unknown;
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id: projectId } = await context.params;
  const { searchParams } = new URL(request.url);

  // A body is optional; tolerate missing/invalid JSON by treating it as empty.
  let body: ExportBody = {};
  try {
    const parsed: unknown = await request.json();
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      body = parsed as ExportBody;
    }
  } catch {
    // No (or non-JSON) body — fall back to query params.
  }

  // Query string wins over body when both are present.
  const format =
    searchParams.get("format") ??
    (typeof body.format === "string" ? body.format : null);

  if (!format) {
    return Response.json(
      { error: "A 'format' is required (e.g. ?format=jsonl)." },
      { status: 400 },
    );
  }

  const statusParam =
    searchParams.get("status") ??
    (typeof body.status === "string" ? body.status : null);
  const status = statusParam ?? undefined;

  try {
    const artifact = await exportProjectAnnotations(projectId, {
      format,
      status,
    });

    return new Response(artifact.content, {
      status: 200,
      headers: {
        "Content-Type": artifact.contentType,
        "Content-Disposition": `attachment; filename="${artifact.filename}"`,
        "X-Export-Id": artifact.export.id,
        "X-Export-Record-Count": String(artifact.recordCount),
      },
    });
  } catch (error) {
    if (error instanceof UnsupportedExportFormatError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof ProjectNotFoundError) {
      return Response.json({ error: error.message }, { status: 404 });
    }
    throw error;
  }
}
