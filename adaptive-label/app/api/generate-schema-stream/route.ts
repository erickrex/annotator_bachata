import { generateWorkspaceSchemaStream } from "@/lib/ai";

/**
 * POST /api/generate-schema-stream (Requirement 1.8).
 *
 * Accepts a free-text dataset description and streams the partial
 * `WorkspaceSchema` to the client as it is produced. The response is a chunked
 * text stream of JSON matching `WorkspaceSchema`, which is the shape
 * `@ai-sdk/react`'s `useObject` consumes (the generation wizard, Task 9).
 *
 * This endpoint does NOT persist anything — activation / immutable versioning
 * is handled separately (Task 7.3 / Requirement 1.7). Stream errors are routed
 * to the generator's `onError` handler rather than thrown (Req 1.8).
 *
 * Outcomes:
 * - success: a streaming `Response` (text stream of partial schema JSON).
 * - bad request (missing/blank description): 400.
 */
export const dynamic = "force-dynamic";

interface GenerateSchemaStreamBody {
  description?: unknown;
}

export async function POST(request: Request) {
  let body: GenerateSchemaStreamBody;
  try {
    body = (await request.json()) as GenerateSchemaStreamBody;
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

  const result = generateWorkspaceSchemaStream(description);
  return result.toTextStreamResponse();
}
