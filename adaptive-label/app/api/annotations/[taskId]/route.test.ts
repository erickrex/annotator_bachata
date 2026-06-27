import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import {
  AnnotationValidationError,
  SchemaNotFoundError,
  TaskNotFoundError,
} from "@/lib/db";

/**
 * Tests for PUT /api/annotations/:taskId.
 *
 * The persistence orchestration is mocked at the `@/lib/db` boundary while the
 * real error classes are preserved, so the route's status mapping is exercised
 * exactly as it runs in production:
 * - valid submit            -> 200 { annotation }
 * - validation failure      -> 422 { error, errors }, nothing returned
 * - unknown task / schema    -> 404
 * - bad request (json/body) -> 400
 */

const submitAnnotationMock = vi.fn();

vi.mock("@/lib/db", async () => {
  const actual = await vi.importActual<typeof import("@/lib/db")>("@/lib/db");
  return {
    ...actual,
    submitAnnotation: (...args: unknown[]) => submitAnnotationMock(...args),
  };
});

async function getHandler() {
  const mod = await import("./route");
  return mod.PUT;
}

function putRequest(taskId: string, body: unknown): Request {
  return new Request(`http://localhost/api/annotations/${taskId}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function ctx(taskId: string) {
  return { params: Promise.resolve({ taskId }) };
}

const PERSISTED_ANNOTATION = {
  id: "annotation-1",
  task_id: "task-1",
  schema_id: "schema-1",
  source: "human",
  status: "submitted",
  values_json: { move_name: "cambré" },
  confidence_json: null,
  validation_json: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

describe("PUT /api/annotations/:taskId", () => {
  beforeEach(() => {
    submitAnnotationMock.mockReset();
  });

  afterEach(() => {
    vi.resetModules();
  });

  it("returns 200 and the persisted annotation on a valid submit", async () => {
    submitAnnotationMock.mockResolvedValue(PERSISTED_ANNOTATION);
    const PUT = await getHandler();

    const res = await PUT(
      putRequest("task-1", { values: { move_name: "cambré" } }),
      ctx("task-1"),
    );
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.annotation.id).toBe("annotation-1");
    expect(body.annotation.source).toBe("human");
    // Default status is submitted.
    expect(submitAnnotationMock).toHaveBeenCalledWith("task-1", {
      values: { move_name: "cambré" },
      status: "submitted",
    });
  });

  it("passes through a draft status from the body", async () => {
    submitAnnotationMock.mockResolvedValue({
      ...PERSISTED_ANNOTATION,
      status: "draft",
    });
    const PUT = await getHandler();

    await PUT(
      putRequest("task-1", { values: { move_name: "wip" }, status: "draft" }),
      ctx("task-1"),
    );
    expect(submitAnnotationMock).toHaveBeenCalledWith("task-1", {
      values: { move_name: "wip" },
      status: "draft",
    });
  });

  it("returns 422 with the failing rules when validation fails", async () => {
    submitAnnotationMock.mockRejectedValue(
      new AnnotationValidationError([
        { field: "move_name", rule: "required", message: "missing" },
        { field: "extra", rule: "unknown_field", message: "not a field" },
      ]),
    );
    const PUT = await getHandler();

    const res = await PUT(
      putRequest("task-1", { values: { extra: 1 } }),
      ctx("task-1"),
    );
    expect(res.status).toBe(422);

    const body = await res.json();
    expect(body.error).toBeDefined();
    expect(Array.isArray(body.errors)).toBe(true);
    expect(body.errors).toHaveLength(2);
    expect(body.errors[0].rule).toBe("required");
    // Nothing persisted is returned.
    expect(body.annotation).toBeUndefined();
  });

  it("returns 404 for an unknown task", async () => {
    submitAnnotationMock.mockRejectedValue(new TaskNotFoundError("task-x"));
    const PUT = await getHandler();

    const res = await PUT(
      putRequest("task-x", { values: {} }),
      ctx("task-x"),
    );
    expect(res.status).toBe(404);
  });

  it("returns 404 when no schema can be resolved", async () => {
    submitAnnotationMock.mockRejectedValue(new SchemaNotFoundError("task-1"));
    const PUT = await getHandler();

    const res = await PUT(
      putRequest("task-1", { values: {} }),
      ctx("task-1"),
    );
    expect(res.status).toBe(404);
  });

  it("returns 400 when the body is not valid JSON", async () => {
    const PUT = await getHandler();

    const res = await PUT(putRequest("task-1", "{ not json"), ctx("task-1"));
    expect(res.status).toBe(400);
    expect(submitAnnotationMock).not.toHaveBeenCalled();
  });

  it("returns 400 when 'values' is missing or not an object", async () => {
    const PUT = await getHandler();

    const missing = await PUT(putRequest("task-1", {}), ctx("task-1"));
    expect(missing.status).toBe(400);

    const notObject = await PUT(
      putRequest("task-1", { values: [1, 2, 3] }),
      ctx("task-1"),
    );
    expect(notObject.status).toBe(400);

    expect(submitAnnotationMock).not.toHaveBeenCalled();
  });

  it("returns 400 for an invalid status value", async () => {
    const PUT = await getHandler();

    const res = await PUT(
      putRequest("task-1", { values: { move_name: "x" }, status: "weird" }),
      ctx("task-1"),
    );
    expect(res.status).toBe(400);
    expect(submitAnnotationMock).not.toHaveBeenCalled();
  });
});
