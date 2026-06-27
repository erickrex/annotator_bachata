import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { SchemaValidationError } from "@/lib/ai/errors";

/**
 * Tests for POST /api/generate-schema.
 *
 * The generator is mocked at the `@/lib/ai` boundary while the real fallback
 * preset selection and `SchemaValidationError` are preserved, so we exercise
 * the route's branching exactly as it runs in production:
 * - valid generation -> 200 { source: "model" }
 * - Zod validation failure -> 422 { error, issues }, nothing persisted
 * - provider failure -> 200 { source: "fallback" } with the matching preset
 */

const generateWorkspaceSchemaMock = vi.fn();

vi.mock("@/lib/ai", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/ai")>("@/lib/ai");
  return {
    ...actual,
    generateWorkspaceSchema: (...args: unknown[]) =>
      generateWorkspaceSchemaMock(...args),
  };
});

async function getHandler() {
  const mod = await import("./route");
  return mod.POST;
}

function postRequest(body: unknown): Request {
  return new Request("http://localhost/api/generate-schema", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const VALID_SCHEMA = {
  domain: "bachata",
  workspaceName: "Bachata Move Annotation",
  timelineMode: "beat_grid",
  workflowStages: ["draft", "submitted", "approved"],
  fields: [
    {
      key: "move_name",
      label: "Move name",
      help: null,
      type: "text",
      required: true,
      options: null,
      min: null,
      max: null,
      group: null,
    },
    {
      key: "move_category",
      label: "Category",
      help: null,
      type: "select",
      required: false,
      options: ["basic", "turn"],
      min: null,
      max: null,
      group: null,
    },
    {
      key: "difficulty",
      label: "Difficulty",
      help: null,
      type: "slider",
      required: false,
      options: null,
      min: 1,
      max: 10,
      group: null,
    },
  ],
};

describe("POST /api/generate-schema", () => {
  beforeEach(() => {
    generateWorkspaceSchemaMock.mockReset();
  });

  afterEach(() => {
    vi.resetModules();
  });

  it("returns 200 and the validated schema on success", async () => {
    generateWorkspaceSchemaMock.mockResolvedValue(VALID_SCHEMA);
    const POST = await getHandler();

    const res = await POST(postRequest({ description: "bachata dataset" }));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.source).toBe("model");
    expect(body.schema.timelineMode).toBe("beat_grid");
    expect(body.fallback).toBeUndefined();
  });

  it("returns 422 with issues and no fallback when validation fails", async () => {
    generateWorkspaceSchemaMock.mockRejectedValue(
      new SchemaValidationError("Generated schema failed validation", [
        // shape mirrors a Zod issue; only presence matters to the route
        { code: "custom", message: "bad", path: ["fields"] } as never,
      ]),
    );
    const POST = await getHandler();

    const res = await POST(postRequest({ description: "bachata dataset" }));
    expect(res.status).toBe(422);

    const body = await res.json();
    expect(body.error).toBeDefined();
    expect(Array.isArray(body.issues)).toBe(true);
    expect(body.issues.length).toBeGreaterThan(0);
    // Persistence is out of scope for this route; assert no schema is returned.
    expect(body.schema).toBeUndefined();
    expect(body.source).toBeUndefined();
  });

  it("falls back to the beat_grid preset on provider failure for a rhythmic description", async () => {
    generateWorkspaceSchemaMock.mockRejectedValue(new Error("network timeout"));
    const POST = await getHandler();

    const res = await POST(
      postRequest({ description: "a dataset of bachata dance clips" }),
    );
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.source).toBe("fallback");
    expect(body.fallback).toBe(true);
    expect(body.schema.timelineMode).toBe("beat_grid");
  });

  it("falls back to the gloss_segments preset on provider failure for a sign-language description", async () => {
    generateWorkspaceSchemaMock.mockRejectedValue(new Error("provider down"));
    const POST = await getHandler();

    const res = await POST(
      postRequest({ description: "ASL sign language gloss annotation dataset" }),
    );
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.source).toBe("fallback");
    expect(body.schema.timelineMode).toBe("gloss_segments");
  });

  it("returns 400 when the description is missing or blank", async () => {
    const POST = await getHandler();

    const missing = await POST(postRequest({}));
    expect(missing.status).toBe(400);

    const blank = await POST(postRequest({ description: "   " }));
    expect(blank.status).toBe(400);

    expect(generateWorkspaceSchemaMock).not.toHaveBeenCalled();
  });

  it("returns 400 when the body is not valid JSON", async () => {
    const POST = await getHandler();

    const res = await POST(
      new Request("http://localhost/api/generate-schema", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{ not json",
      }),
    );
    expect(res.status).toBe(400);
  });
});
