import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * Tests for POST /api/generate-schema-stream.
 *
 * The stream generator is mocked at the `@/lib/ai` boundary so no real network
 * call happens. We assert:
 * - a valid description -> a streaming Response built from the generator result
 * - a missing/blank description -> 400 and the generator is never called
 * - a non-JSON body -> 400
 */

const generateWorkspaceSchemaStreamMock = vi.fn();

vi.mock("@/lib/ai", async () => {
  const actual = await vi.importActual<typeof import("@/lib/ai")>("@/lib/ai");
  return {
    ...actual,
    generateWorkspaceSchemaStream: (...args: unknown[]) =>
      generateWorkspaceSchemaStreamMock(...args),
  };
});

async function getHandler() {
  const mod = await import("./route");
  return mod.POST;
}

function postRequest(body: unknown): Request {
  return new Request("http://localhost/api/generate-schema-stream", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/generate-schema-stream", () => {
  beforeEach(() => {
    generateWorkspaceSchemaStreamMock.mockReset();
  });

  afterEach(() => {
    vi.resetModules();
  });

  it("returns the streaming Response produced by the generator", async () => {
    const streamingResponse = new Response("partial schema stream", {
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
    const toTextStreamResponse = vi.fn(() => streamingResponse);
    generateWorkspaceSchemaStreamMock.mockReturnValue({ toTextStreamResponse });

    const POST = await getHandler();
    const res = await POST(postRequest({ description: "bachata dataset" }));

    expect(generateWorkspaceSchemaStreamMock).toHaveBeenCalledWith(
      "bachata dataset",
    );
    expect(toTextStreamResponse).toHaveBeenCalledOnce();
    expect(res).toBe(streamingResponse);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("partial schema stream");
  });

  it("trims the description before passing it to the generator", async () => {
    const toTextStreamResponse = vi.fn(() => new Response("ok"));
    generateWorkspaceSchemaStreamMock.mockReturnValue({ toTextStreamResponse });

    const POST = await getHandler();
    await POST(postRequest({ description: "  sign language dataset  " }));

    expect(generateWorkspaceSchemaStreamMock).toHaveBeenCalledWith(
      "sign language dataset",
    );
  });

  it("returns 400 when the description is missing or blank", async () => {
    const POST = await getHandler();

    const missing = await POST(postRequest({}));
    expect(missing.status).toBe(400);

    const blank = await POST(postRequest({ description: "   " }));
    expect(blank.status).toBe(400);

    expect(generateWorkspaceSchemaStreamMock).not.toHaveBeenCalled();
  });

  it("returns 400 when the body is not valid JSON", async () => {
    const POST = await getHandler();

    const res = await POST(
      new Request("http://localhost/api/generate-schema-stream", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{ not json",
      }),
    );
    expect(res.status).toBe(400);
    expect(generateWorkspaceSchemaStreamMock).not.toHaveBeenCalled();
  });
});
