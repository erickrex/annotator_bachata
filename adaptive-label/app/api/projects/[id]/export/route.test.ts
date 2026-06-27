import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import {
  ProjectNotFoundError,
  UnsupportedExportFormatError,
} from "@/lib/export/export-annotations";

/**
 * Tests for POST /api/projects/:id/export.
 *
 * The orchestration is mocked at the `@/lib/export/export-annotations` boundary
 * (the real error classes are preserved), so the route's param parsing, status
 * mapping, and download headers are exercised as they run in production:
 * - jsonl export            -> 200 with body + download headers (Req 6.3)
 * - unsupported format      -> 400
 * - missing format          -> 400 (orchestration not called)
 * - unknown project         -> 404
 */

const exportMock = vi.fn();

vi.mock("@/lib/export/export-annotations", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/export/export-annotations")
  >("@/lib/export/export-annotations");
  return {
    ...actual,
    exportProjectAnnotations: (...args: unknown[]) => exportMock(...args),
  };
});

async function getHandler() {
  const mod = await import("./route");
  return mod.POST;
}

function postRequest(id: string, query = "", body?: unknown): Request {
  const init: RequestInit = { method: "POST" };
  if (body !== undefined) {
    init.headers = { "content-type": "application/json" };
    init.body = typeof body === "string" ? body : JSON.stringify(body);
  }
  return new Request(`http://localhost/api/projects/${id}/export${query}`, init);
}

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

const ARTIFACT = {
  export: { id: "export-1" },
  content: '{"clip_id":"clip-1","schema_version":1,"status":"submitted","values":{}}',
  recordCount: 1,
  filename: "project-1-annotations.jsonl",
  contentType: "application/x-ndjson",
  format: "jsonl" as const,
};

describe("POST /api/projects/:id/export", () => {
  beforeEach(() => {
    exportMock.mockReset();
  });

  afterEach(() => {
    vi.resetModules();
  });

  it("returns 200 with the JSONL body and download headers", async () => {
    exportMock.mockResolvedValue(ARTIFACT);
    const POST = await getHandler();

    const res = await POST(
      postRequest("project-1", "?format=jsonl"),
      ctx("project-1"),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/x-ndjson");
    expect(res.headers.get("Content-Disposition")).toContain("attachment");
    expect(res.headers.get("Content-Disposition")).toContain(
      "project-1-annotations.jsonl",
    );
    expect(res.headers.get("X-Export-Id")).toBe("export-1");
    expect(res.headers.get("X-Export-Record-Count")).toBe("1");

    const text = await res.text();
    expect(text).toBe(ARTIFACT.content);

    expect(exportMock).toHaveBeenCalledWith("project-1", {
      format: "jsonl",
      status: undefined,
    });
  });

  it("passes a status filter through from the query string", async () => {
    exportMock.mockResolvedValue(ARTIFACT);
    const POST = await getHandler();

    await POST(
      postRequest("project-1", "?format=jsonl&status=approved"),
      ctx("project-1"),
    );
    expect(exportMock).toHaveBeenCalledWith("project-1", {
      format: "jsonl",
      status: "approved",
    });
  });

  it("reads format and status from a JSON body when not in the query", async () => {
    exportMock.mockResolvedValue(ARTIFACT);
    const POST = await getHandler();

    await POST(
      postRequest("project-1", "", { format: "jsonl", status: "submitted" }),
      ctx("project-1"),
    );
    expect(exportMock).toHaveBeenCalledWith("project-1", {
      format: "jsonl",
      status: "submitted",
    });
  });

  it("returns 400 when no format is provided", async () => {
    const POST = await getHandler();

    const res = await POST(postRequest("project-1"), ctx("project-1"));
    expect(res.status).toBe(400);
    expect(exportMock).not.toHaveBeenCalled();
  });

  it("returns 400 for an unsupported format", async () => {
    exportMock.mockRejectedValue(new UnsupportedExportFormatError("csv"));
    const POST = await getHandler();

    const res = await POST(
      postRequest("project-1", "?format=csv"),
      ctx("project-1"),
    );
    expect(res.status).toBe(400);
  });

  it("returns 404 for an unknown project", async () => {
    exportMock.mockRejectedValue(new ProjectNotFoundError("missing"));
    const POST = await getHandler();

    const res = await POST(
      postRequest("missing", "?format=jsonl"),
      ctx("missing"),
    );
    expect(res.status).toBe(404);
  });
});
