"use client";

import * as React from "react";

import type { WorkspaceSchema } from "@/lib/schemas/workspace";
import type { AnnotationRow } from "@/lib/db/types";
import {
  submitAnnotation as defaultSubmitAnnotation,
  type SubmitAnnotationResult,
} from "@/lib/client/annotations";
import type { ValidationError } from "@/lib/validation";

import {
  WorkspaceForm,
  type AnnotationValues,
  type WorkspaceFormState,
} from "./WorkspaceForm";

export interface AnnotationWorkspaceProps {
  /** The labeling task whose annotation is being saved. */
  taskId: string;
  /** The active workspace schema to render and validate against. */
  schema: WorkspaceSchema;
  /** Initial annotation values, keyed by field `key`. */
  initialValues?: AnnotationValues;
  /** Called after a successful persist with the stored annotation row. */
  onSubmitted?: (annotation: AnnotationRow) => void;
  /**
   * The submit transport. Defaults to the real `PUT /api/annotations/:taskId`
   * helper; injectable so the wiring can be tested without a live network.
   */
  submit?: (
    taskId: string,
    request: { values: AnnotationValues; status?: "draft" | "submitted" },
  ) => Promise<SubmitAnnotationResult>;
}

/**
 * Composes the deterministic `WorkspaceForm` with the save/submit transport
 * (Task 10.2): on submit it PUTs the values to `/api/annotations/:taskId` and,
 * when the server blocks the write, surfaces the returned `{ field, rule,
 * message }` errors inline and keeps the form open (Req 4.3). On success it
 * clears errors, shows a confirmation, and notifies `onSubmitted`.
 *
 * This is the reusable composition that the workspace page (Task 13) mounts;
 * the page only supplies the task, schema, and initial values.
 */
export function AnnotationWorkspace({
  taskId,
  schema,
  initialValues,
  onSubmitted,
  submit = defaultSubmitAnnotation,
}: AnnotationWorkspaceProps) {
  const [errors, setErrors] = React.useState<ValidationError[]>([]);
  const [message, setMessage] = React.useState<string | null>(null);
  const [saved, setSaved] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);

  const handleSubmit = React.useCallback(
    async ({ values }: WorkspaceFormState) => {
      setSubmitting(true);
      setSaved(false);
      const result = await submit(taskId, { values, status: "submitted" });
      setSubmitting(false);

      if (result.ok) {
        setErrors([]);
        setMessage(null);
        setSaved(true);
        onSubmitted?.(result.annotation);
        return;
      }

      // Blocked: surface the failing rules and keep the form open.
      setSaved(false);
      setErrors(result.errors);
      setMessage(result.message);
    },
    [submit, taskId, onSubmitted],
  );

  return (
    <div className="flex flex-col gap-4">
      {errors.length > 0 ? (
        <div
          role="alert"
          data-testid="annotation-errors"
          className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
        >
          <p className="font-semibold">
            {message ?? "Please fix the following before submitting:"}
          </p>
          <ul className="mt-2 list-disc pl-5">
            {errors.map((err, index) => (
              <li key={`${err.field}-${err.rule}-${index}`}>
                <span className="font-medium">{err.field}</span>: {err.message}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {saved ? (
        <p
          role="status"
          data-testid="annotation-saved"
          className="rounded-md border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm text-emerald-700"
        >
          Annotation saved.
        </p>
      ) : null}

      <WorkspaceForm
        schema={schema}
        initialValues={initialValues}
        onSubmit={handleSubmit}
        submitLabel={submitting ? "Saving…" : "Submit annotation"}
      />
    </div>
  );
}
