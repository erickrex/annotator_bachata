import { streamText, Output, type LanguageModel } from "ai";
import { createOpenAI } from "@ai-sdk/openai";

import { WorkspaceSchema } from "@/lib/schemas/workspace";
import { getServerEnv } from "@/lib/env";
import { SCHEMA_GENERATION_SYSTEM_PROMPT } from "./generateWorkspaceSchema";

/**
 * Default OpenAI chat model id used for streaming schema generation. Mirrors
 * the non-streaming generator so both code paths use the same model by default.
 */
const DEFAULT_SCHEMA_MODEL = "gpt-4o-mini";

/** Signature of the `streamText` function (injected so tests can stub it). */
export type StreamTextFn = typeof streamText;

/**
 * Callback invoked when the underlying stream errors (Requirement 1.8). The AI
 * SDK delivers stream errors here rather than throwing, so a handler is
 * required to surface/log them instead of silently dropping the failure.
 */
export type StreamErrorHandler = (event: { error: unknown }) => void;

export interface GenerateWorkspaceSchemaStreamDeps {
  /** Language model to use. Defaults to the configured OpenAI chat model. */
  model?: LanguageModel;
  /** `streamText` implementation. Injectable so tests avoid network calls. */
  stream?: StreamTextFn;
  /**
   * Error handler wired into `streamText`'s `onError` (Req 1.8). Defaults to a
   * handler that logs the error so streaming failures are observable.
   */
  onError?: StreamErrorHandler;
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

/** Default `onError` handler: log so streaming failures are observable. */
function defaultOnError({ error }: { error: unknown }): void {
  console.error("generateWorkspaceSchemaStream stream error", error);
}

/**
 * Stream a `WorkspaceSchema` from a free-text dataset description
 * (Requirement 1.8).
 *
 * Uses the AI SDK `Output` API (`streamText` + `Output.object`) so partial
 * schema fields are emitted as they are produced. The returned result's text
 * stream emits JSON matching `WorkspaceSchema` as chunked text, which is the
 * shape `@ai-sdk/react`'s `useObject` consumes — call
 * `result.toTextStreamResponse()` in the route handler to expose it.
 *
 * Stream errors do not throw; they are delivered to the `onError` callback
 * (Req 1.8). The model/`streamText` fn are injectable so tests never make real
 * network calls.
 */
export function generateWorkspaceSchemaStream(
  description: string,
  deps: GenerateWorkspaceSchemaStreamDeps = {},
) {
  const stream = deps.stream ?? streamText;
  const model = deps.model ?? defaultModel();
  const onError = deps.onError ?? defaultOnError;

  return stream({
    model,
    output: Output.object({ schema: WorkspaceSchema }),
    system: SCHEMA_GENERATION_SYSTEM_PROMPT,
    prompt: description,
    onError,
  });
}
