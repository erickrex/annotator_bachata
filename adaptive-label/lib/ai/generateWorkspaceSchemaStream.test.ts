import { describe, it, expect, vi } from "vitest";
import { type LanguageModel } from "ai";

import {
  generateWorkspaceSchemaStream,
  type StreamTextFn,
} from "./generateWorkspaceSchemaStream";
import { SCHEMA_GENERATION_SYSTEM_PROMPT } from "./generateWorkspaceSchema";

/**
 * Tests for `generateWorkspaceSchemaStream`.
 *
 * The `streamText` function is injected so no real network call is made. We
 * assert the generator wires the structured-output schema, reuses the shared
 * system prompt, forwards the description as the prompt, and installs an
 * `onError` handler (Requirement 1.8).
 */

/** A stand-in language model; the injected `streamText` mock ignores it. */
const fakeModel = {} as unknown as LanguageModel;

/** A minimal `streamText`-shaped mock returning a fake stream result. */
function streamReturning() {
  const result = {
    toTextStreamResponse: vi.fn(() => new Response("stream")),
  };
  const stream = vi.fn(() => result) as unknown as StreamTextFn;
  return { stream, result };
}

/** Pull the single call's options object off the injected mock. */
function callOptions(stream: StreamTextFn) {
  return (stream as unknown as { mock: { calls: unknown[][] } }).mock
    .calls[0][0] as {
    model: LanguageModel;
    output: { name: string; responseFormat: PromiseLike<unknown> };
    system: string;
    prompt: string;
    onError: (event: { error: unknown }) => void;
  };
}

describe("generateWorkspaceSchemaStream", () => {
  it("wires the model, system prompt, and description into streamText", () => {
    const { stream } = streamReturning();

    generateWorkspaceSchemaStream("bachata dance dataset", {
      model: fakeModel,
      stream,
    });

    expect(stream).toHaveBeenCalledOnce();
    const opts = callOptions(stream);
    expect(opts.model).toBe(fakeModel);
    expect(opts.system).toBe(SCHEMA_GENERATION_SYSTEM_PROMPT);
    expect(opts.prompt).toBe("bachata dance dataset");
  });

  it("constrains the stream to the WorkspaceSchema structured output", async () => {
    const { stream } = streamReturning();

    generateWorkspaceSchemaStream("sign language gloss dataset", {
      model: fakeModel,
      stream,
    });

    const opts = callOptions(stream);
    // Object output mode (Output.object), not a plain text stream.
    expect(opts.output.name).toBe("object");

    // The JSON schema sent to the model is the WorkspaceSchema shape.
    const responseFormat = (await opts.output.responseFormat) as {
      type: string;
      schema: { properties: Record<string, unknown> };
    };
    expect(responseFormat.type).toBe("json");
    expect(Object.keys(responseFormat.schema.properties).sort()).toEqual(
      ["domain", "fields", "timelineMode", "workflowStages", "workspaceName"],
    );
  });

  it("forwards the injected onError handler to streamText (Req 1.8)", () => {
    const { stream } = streamReturning();
    const onError = vi.fn();

    generateWorkspaceSchemaStream("bachata dataset", {
      model: fakeModel,
      stream,
      onError,
    });

    const opts = callOptions(stream);
    expect(opts.onError).toBe(onError);

    // The handler is invoked with the SDK error event shape.
    const error = new Error("stream boom");
    opts.onError({ error });
    expect(onError).toHaveBeenCalledWith({ error });
  });

  it("installs a default onError handler that logs when none is injected", () => {
    const { stream } = streamReturning();
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    generateWorkspaceSchemaStream("bachata dataset", {
      model: fakeModel,
      stream,
    });

    const opts = callOptions(stream);
    expect(typeof opts.onError).toBe("function");

    const error = new Error("stream boom");
    opts.onError({ error });
    expect(consoleError).toHaveBeenCalled();

    consoleError.mockRestore();
  });

  it("returns the streamText result so callers can build the response", () => {
    const { stream, result } = streamReturning();

    const returned = generateWorkspaceSchemaStream("bachata dataset", {
      model: fakeModel,
      stream,
    });

    expect(returned).toBe(result);
  });
});
