"use client";

import * as React from "react";
import { experimental_useObject as useObject } from "@ai-sdk/react";

import { Button } from "@/components/ui/button";
import { WorkspaceSchema } from "@/lib/schemas/workspace";
import { SchemaPreview } from "./SchemaPreview";
import {
  parseCompleteWorkspaceSchema,
  type PartialWorkspaceSchema,
} from "./wizard-helpers";

/** Successful activation response shape (from Task 7.3's route handler). */
interface ActivationResult {
  schemaId: string;
  version: number;
  status: string;
  timelineMode: string;
  fieldCount: number;
}

/**
 * `/wizard` — the streaming schema-generation page (Requirements 1.1, 1.8).
 *
 * The user describes their dataset in plain English and presses Generate; the
 * partial `WorkspaceSchema` is streamed from `/api/generate-schema-stream` via
 * `useObject` and previewed live as fields arrive. Once a complete, valid
 * schema has streamed in, the user supplies a target project id and Accepts,
 * which persists an immutable schema version through the activation endpoint
 * (Task 7.3) and reports the resulting version/schema id.
 *
 * Network/AI work happens only in the route handlers; this page just streams,
 * previews, and posts the accepted schema.
 */
export default function WizardPage() {
  const [description, setDescription] = React.useState("");
  const [projectId, setProjectId] = React.useState("");

  // The prompt actually used for the in-flight/last generation. Sent verbatim
  // as `generationPrompt` on activation so the persisted version records what
  // produced it (Req 1.7).
  const [submittedPrompt, setSubmittedPrompt] = React.useState("");

  const [accepting, setAccepting] = React.useState(false);
  const [activationResult, setActivationResult] =
    React.useState<ActivationResult | null>(null);
  const [activationError, setActivationError] = React.useState<string | null>(
    null,
  );

  const {
    submit,
    object,
    isLoading,
    error,
    stop,
  } = useObject({
    api: "/api/generate-schema-stream",
    schema: WorkspaceSchema,
  });

  // `object` is a deeply-partial WorkspaceSchema while streaming.
  const partial = object as PartialWorkspaceSchema | undefined;

  // The single gate for enabling Accept: a fully valid, complete schema.
  const completeSchema = React.useMemo(
    () => parseCompleteWorkspaceSchema(partial),
    [partial],
  );

  const trimmedDescription = description.trim();
  const trimmedProjectId = projectId.trim();

  const handleGenerate = React.useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (trimmedDescription.length === 0 || isLoading) return;
      // Reset any prior activation outcome before a fresh generation.
      setActivationResult(null);
      setActivationError(null);
      setSubmittedPrompt(trimmedDescription);
      submit({ description: trimmedDescription });
    },
    [trimmedDescription, isLoading, submit],
  );

  const handleAccept = React.useCallback(async () => {
    if (!completeSchema || trimmedProjectId.length === 0 || accepting) return;
    setAccepting(true);
    setActivationError(null);
    setActivationResult(null);
    try {
      const response = await fetch(
        `/api/projects/${encodeURIComponent(trimmedProjectId)}/activate-schema`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            schema: completeSchema,
            generationPrompt: submittedPrompt,
          }),
        },
      );

      const payload = (await response.json().catch(() => null)) as
        | (ActivationResult & { error?: string })
        | { error?: string }
        | null;

      if (!response.ok) {
        const message =
          (payload && "error" in payload && payload.error) ||
          `Activation failed (HTTP ${response.status}).`;
        setActivationError(message);
        return;
      }

      setActivationResult(payload as ActivationResult);
    } catch (err) {
      setActivationError(
        err instanceof Error ? err.message : "Activation request failed.",
      );
    } finally {
      setAccepting(false);
    }
  }, [completeSchema, trimmedProjectId, accepting, submittedPrompt]);

  const acceptDisabled =
    !completeSchema || isLoading || accepting || trimmedProjectId.length === 0;

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 p-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          Generate a labeling workspace
        </h1>
        <p className="text-sm text-muted-foreground">
          Describe your dataset in plain English. AdaptiveLabel streams a
          validated workspace schema you can preview and activate.
        </p>
      </header>

      <form onSubmit={handleGenerate} className="flex flex-col gap-3">
        <label
          htmlFor="dataset-description"
          className="text-sm font-medium text-foreground"
        >
          Dataset description
        </label>
        <textarea
          id="dataset-description"
          name="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          placeholder="e.g. Bachata dance clips to label by move, footwork, and beat alignment."
          className="w-full rounded-md border border-input bg-background p-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={trimmedDescription.length === 0 || isLoading}>
            {isLoading ? "Generating…" : "Generate"}
          </Button>
          {isLoading ? (
            <Button type="button" variant="outline" onClick={() => stop()}>
              Stop
            </Button>
          ) : null}
          {isLoading ? (
            <span
              role="status"
              aria-live="polite"
              className="text-sm text-muted-foreground"
            >
              Streaming schema…
            </span>
          ) : null}
        </div>
      </form>

      {error ? (
        <div
          role="alert"
          className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive"
        >
          Generation failed: {error.message}
        </div>
      ) : null}

      <SchemaPreview schema={partial} streaming={isLoading} />

      <section className="flex flex-col gap-3 rounded-lg border border-input p-6">
        <h2 className="text-base font-semibold text-foreground">
          Activate this schema
        </h2>
        <p className="text-sm text-muted-foreground">
          Once a complete schema has generated, enter the target project id to
          persist it as a new immutable version.
        </p>
        <label htmlFor="project-id" className="text-sm font-medium text-foreground">
          Target project id
        </label>
        <input
          id="project-id"
          name="projectId"
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          placeholder="e.g. 3f2a…  (an existing project's UUID)"
          className="w-full rounded-md border border-input bg-background p-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <div className="flex items-center gap-3">
          <Button type="button" onClick={handleAccept} disabled={acceptDisabled}>
            {accepting ? "Activating…" : "Accept & activate"}
          </Button>
          {!completeSchema && !isLoading && (object !== undefined) ? (
            <span className="text-xs text-muted-foreground">
              Schema is not complete yet.
            </span>
          ) : null}
        </div>

        {activationResult ? (
          <div
            role="status"
            className="rounded-md border border-input bg-muted/40 p-3 text-sm"
          >
            Activated version {activationResult.version} ·{" "}
            <span className="font-mono text-xs">{activationResult.schemaId}</span>{" "}
            ({activationResult.fieldCount} fields, {activationResult.timelineMode})
          </div>
        ) : null}

        {activationError ? (
          <div
            role="alert"
            className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive"
          >
            {activationError}
          </div>
        ) : null}
      </section>
    </main>
  );
}
