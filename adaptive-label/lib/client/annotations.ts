/**
 * Client-side helper for saving/submitting annotations
 * (`PUT /api/annotations/:taskId`).
 *
 * Wraps the network call so UI components don't deal with `fetch`/status-code
 * branching directly. Returns a discriminated result the form can switch on:
 * a success carries the persisted annotation; a failure carries the validation
 * errors (422) or a generic message (other statuses) so they can be surfaced
 * inline and the submission blocked (Req 4.3).
 *
 * `fetchImpl` is injectable so the helper can be unit-tested without a real
 * network (no live HTTP is performed in tests).
 */

import type { AnnotationRow } from "@/lib/db/types";
import type { ValidationError } from "@/lib/validation";

export type SubmitAnnotationStatus = "draft" | "submitted";

export interface SubmitAnnotationRequest {
  values: Record<string, unknown>;
  status?: SubmitAnnotationStatus;
}

export type SubmitAnnotationResult =
  | { ok: true; annotation: AnnotationRow }
  | { ok: false; status: number; errors: ValidationError[]; message: string };

type FetchLike = (
  input: string,
  init?: RequestInit,
) => Promise<Response>;

/**
 * PUT the annotation values for `taskId`. Resolves to a tagged result rather
 * than throwing on a non-2xx response, so callers handle validation failures as
 * data. Network/parse errors resolve to a generic failure result too.
 */
export async function submitAnnotation(
  taskId: string,
  request: SubmitAnnotationRequest,
  fetchImpl: FetchLike = fetch,
): Promise<SubmitAnnotationResult> {
  let response: Response;
  try {
    response = await fetchImpl(
      `/api/annotations/${encodeURIComponent(taskId)}`,
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          values: request.values,
          status: request.status ?? "submitted",
        }),
      },
    );
  } catch {
    return {
      ok: false,
      status: 0,
      errors: [],
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
    annotation?: AnnotationRow;
    error?: string;
    errors?: ValidationError[];
  };

  if (response.ok && data.annotation) {
    return { ok: true, annotation: data.annotation };
  }

  return {
    ok: false,
    status: response.status,
    errors: Array.isArray(data.errors) ? data.errors : [],
    message: data.error ?? "Failed to save annotation.",
  };
}
