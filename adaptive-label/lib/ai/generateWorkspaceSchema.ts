import {
  generateText,
  Output,
  NoObjectGeneratedError,
  NoOutputGeneratedError,
  type LanguageModel,
} from "ai";
import { createOpenAI } from "@ai-sdk/openai";

import { WorkspaceSchema } from "@/lib/schemas/workspace";
import { getServerEnv } from "@/lib/env";
import { SchemaValidationError } from "./errors";

/**
 * System prompt that instructs the model to emit a valid `WorkspaceSchema`.
 * The domain → timeline rules are stated explicitly so the model honours
 * Requirements 1.4 (rhythmic/musical → `beat_grid`) and 1.5 (sign language →
 * `gloss_segments`). The actual structural contract is enforced by the Zod
 * schema via the `Output` specification, not by the prose here.
 */
export const SCHEMA_GENERATION_SYSTEM_PROMPT = `You design labeling workspace configurations for a video annotation platform.

Given a plain-English description of a dataset, produce a single WorkspaceSchema object:
- "domain": a short machine-friendly domain slug for the dataset.
- "workspaceName": a concise human-readable workspace title.
- "timelineMode": one of "beat_grid", "phase_rep", or "gloss_segments".
  - Use "beat_grid" when the dataset describes a rhythmic or musical movement domain (e.g. dance, music, choreography).
  - Use "gloss_segments" when the dataset describes sign language annotation.
  - Use "phase_rep" only for repetition/phase-based movement (e.g. exercises).
- "fields": between 3 and 24 label fields. Each field has:
  - "key": lowercase snake_case matching ^[a-z0-9_]+$, unique within the schema.
  - "label": a human-readable label.
  - "help": a short helper string, or null.
  - "type": one of text, textarea, select, multiselect, checkbox, radio, slider, number, time_range, timeline_marker.
  - "required": boolean.
  - "options": array of strings for select/multiselect/radio, otherwise null.
  - "min"/"max": numbers for slider/number fields, otherwise null.
  - "group": a section name, or null.
- "workflowStages": an ordered list of workflow stage names (e.g. draft, submitted, approved).

Return only the structured object. Do not generate UI code.`;

/** Default OpenAI chat model id used for schema generation. */
const DEFAULT_SCHEMA_MODEL = "gpt-4o-mini";

/** Signature of the `generateText` function (injected so tests can stub it). */
export type GenerateTextFn = typeof generateText;

export interface GenerateWorkspaceSchemaDeps {
  /** Language model to use. Defaults to the configured OpenAI chat model. */
  model?: LanguageModel;
  /** `generateText` implementation. Injectable so tests avoid network calls. */
  generate?: GenerateTextFn;
}

/**
 * Lazily construct the default OpenAI model. Kept lazy so importing this module
 * never requires `OPENAI_API_KEY`; the key is only read when a real generation
 * is performed without an injected model (i.e. not in tests).
 */
function defaultModel(): LanguageModel {
  const env = getServerEnv();
  const openai = createOpenAI({ apiKey: env.OPENAI_API_KEY });
  const modelId = process.env.AI_SCHEMA_MODEL ?? DEFAULT_SCHEMA_MODEL;
  return openai(modelId);
}

/**
 * Generate a validated `WorkspaceSchema` from a free-text dataset description
 * (Requirements 1.1, 1.2).
 *
 * Uses the AI SDK `Output` API (`generateText` + `Output.object`) so the model
 * is constrained to the schema shape, then re-validates the result against
 * `WorkspaceSchema` as defense-in-depth (so we own the resulting Zod issues).
 *
 * @returns a fully validated `WorkspaceSchema`.
 * @throws {SchemaValidationError} when the model output fails Zod validation
 *   (Requirement 1.3). Callers must surface this as a structured error and
 *   persist nothing.
 * @throws the underlying error for provider/network failures, so callers can
 *   fall back to a deterministic preset (Requirement 1.9).
 */
export async function generateWorkspaceSchema(
  description: string,
  deps: GenerateWorkspaceSchemaDeps = {},
): Promise<WorkspaceSchema> {
  const generate = deps.generate ?? generateText;
  const model = deps.model ?? defaultModel();

  let rawOutput: unknown;
  try {
    const result = await generate({
      model,
      output: Output.object({ schema: WorkspaceSchema }),
      system: SCHEMA_GENERATION_SYSTEM_PROMPT,
      prompt: description,
    });
    rawOutput = result.output;
  } catch (error) {
    // The SDK throws these when the model produced output that could not be
    // coerced/validated into the requested object. That is a validation
    // failure (Req 1.3), not a provider failure — translate it so callers do
    // NOT fall back to a preset for malformed model output.
    if (
      NoObjectGeneratedError.isInstance(error) ||
      NoOutputGeneratedError.isInstance(error)
    ) {
      throw new SchemaValidationError(
        "Model output failed schema validation",
      );
    }
    // Anything else (network, timeout, auth, provider outage) propagates so the
    // caller can fall back to a deterministic preset (Req 1.9).
    throw error;
  }

  const parsed = WorkspaceSchema.safeParse(rawOutput);
  if (!parsed.success) {
    throw new SchemaValidationError(
      "Model output failed schema validation",
      parsed.error.issues,
    );
  }
  return parsed.data;
}
