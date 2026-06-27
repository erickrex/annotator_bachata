import { describe, it, expect, vi } from "vitest";
import { NoObjectGeneratedError, type LanguageModel } from "ai";

import { generateWorkspaceSchema } from "./generateWorkspaceSchema";
import { SchemaValidationError } from "./errors";
import { PRESETS } from "@/lib/schemas/workspace";

/**
 * A stand-in language model. The injected `generate` mock ignores it, but it is
 * required so the generator never constructs the real OpenAI model (which would
 * read env / make network calls).
 */
const fakeModel = {} as unknown as LanguageModel;

/** Build a `generateText`-shaped mock that resolves with a given `output`. */
function generateReturning(output: unknown) {
  return vi.fn(async () => ({ output }) as never);
}

describe("generateWorkspaceSchema", () => {
  it("returns a validated schema when the model output is valid", async () => {
    const generate = generateReturning(PRESETS.bachata);

    const schema = await generateWorkspaceSchema("bachata dance dataset", {
      model: fakeModel,
      generate,
    });

    expect(generate).toHaveBeenCalledOnce();
    expect(schema.timelineMode).toBe("beat_grid");
    expect(schema.fields.length).toBeGreaterThanOrEqual(3);
  });

  it("throws SchemaValidationError when the model output fails Zod validation", async () => {
    // Too few fields + bad field type: fails WorkspaceSchema.
    const generate = generateReturning({
      domain: "bachata",
      workspaceName: "Bad",
      timelineMode: "beat_grid",
      fields: [{ key: "x", label: "X", type: "not_a_real_type" }],
      workflowStages: ["draft"],
    });

    await expect(
      generateWorkspaceSchema("bachata dance dataset", {
        model: fakeModel,
        generate,
      }),
    ).rejects.toBeInstanceOf(SchemaValidationError);
  });

  it("attaches Zod issues to the SchemaValidationError", async () => {
    const generate = generateReturning({ fields: [] });

    try {
      await generateWorkspaceSchema("x", { model: fakeModel, generate });
      expect.unreachable("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(SchemaValidationError);
      expect((error as SchemaValidationError).issues.length).toBeGreaterThan(0);
    }
  });

  it("translates a NoObjectGeneratedError into a SchemaValidationError", async () => {
    const generate = vi.fn(async () => {
      throw new NoObjectGeneratedError({
        message: "could not parse",
        text: "not json",
        response: { id: "1", timestamp: new Date(), modelId: "m" },
        usage: {
          inputTokens: 1,
          inputTokenDetails: {
            noCacheTokens: 1,
            cacheReadTokens: 0,
            cacheWriteTokens: 0,
          },
          outputTokens: 1,
          outputTokenDetails: {
            textTokens: 1,
            reasoningTokens: 0,
          },
          totalTokens: 2,
        },
        finishReason: "stop",
      });
    });

    await expect(
      generateWorkspaceSchema("x", { model: fakeModel, generate }),
    ).rejects.toBeInstanceOf(SchemaValidationError);
  });

  it("propagates provider/network errors (so callers can fall back)", async () => {
    const generate = vi.fn(async () => {
      throw new Error("network timeout");
    });

    await expect(
      generateWorkspaceSchema("x", { model: fakeModel, generate }),
    ).rejects.toThrow("network timeout");
    // A raw provider error must NOT be a SchemaValidationError.
    await generateWorkspaceSchema("x", {
      model: fakeModel,
      generate,
    }).catch((error) => {
      expect(error).not.toBeInstanceOf(SchemaValidationError);
    });
  });
});
