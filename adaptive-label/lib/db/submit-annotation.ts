/**
 * Annotation save/submit — validation + persistence (Requirements 4.1, 4.4,
 * 4.5 / Property 4).
 *
 * Submitting an annotation validates the supplied values against the task's
 * active schema and, on success, persists them to the `annotations` table with
 * source `human`. The core invariants enforced here are:
 *
 *  - **Validation gate (Req 4.2 / 4.3):** required presence, enum membership,
 *    and numeric range are checked via the generic validator. Any failure
 *    blocks the write and the failing `{ field, rule, message }` list is
 *    surfaced; nothing is persisted.
 *  - **Subset invariant (Req 4.5 / Property 4):** the submitted value keys must
 *    be a subset of the schema's field keys. Extraneous keys are *rejected*
 *    (rule `unknown_field`) rather than silently dropped, so the annotator sees
 *    exactly what was wrong, and the persisted `values_json` is guaranteed to
 *    key only on schema fields.
 *  - **Source + schema version (Req 4.4):** persisted annotations record
 *    `source = 'human'` and the resolving schema's id (its immutable version).
 *
 * As with schema activation, the orchestration is written against a small
 * dependency surface (`SubmitAnnotationDeps`) instead of importing the pooled
 * client directly, so it can be exercised genuinely against an in-memory store
 * in tests without a live database. In production the default deps are the real
 * `@/lib/db` query helpers.
 */

import type {
  ValidationError,
} from "@/lib/validation";
import { extraneousValueKeys, validateAnnotation } from "@/lib/validation";

import {
  createAnnotation,
  getActiveSchema,
  getSchemaById,
  getTaskById,
  listAnnotationsForTask,
  listFieldsForSchema,
  updateAnnotation,
  type NewAnnotation,
  type AnnotationUpdate,
} from "./queries";
import { workspaceSchemaFromRows } from "./schema-from-rows";
import type {
  AnnotationRow,
  LabelFieldRow,
  LabelSchemaRow,
  LabelingTaskRow,
} from "./types";

/** The annotation source persisted by this flow. */
const HUMAN_SOURCE = "human";

/** Statuses a save/submit may set. `draft` saves WIP; `submitted` finalizes. */
export type SubmitStatus = "draft" | "submitted";

/** The collaborators the submit flow needs. Mirrors the real `@/lib/db`. */
export interface SubmitAnnotationDeps {
  getTaskById(id: string): Promise<LabelingTaskRow | null>;
  getSchemaById(id: string): Promise<LabelSchemaRow | null>;
  getActiveSchema(projectId: string): Promise<LabelSchemaRow | null>;
  listFieldsForSchema(schemaId: string): Promise<LabelFieldRow[]>;
  listAnnotationsForTask(taskId: string): Promise<AnnotationRow[]>;
  createAnnotation(input: NewAnnotation): Promise<AnnotationRow>;
  updateAnnotation(
    id: string,
    patch: AnnotationUpdate,
  ): Promise<AnnotationRow | null>;
}

/** Production wiring: the real pooled-client query helpers. */
const defaultDeps: SubmitAnnotationDeps = {
  getTaskById,
  getSchemaById,
  getActiveSchema,
  listFieldsForSchema,
  listAnnotationsForTask,
  createAnnotation,
  updateAnnotation,
};

/** Raised when the target labeling task does not exist (→ 404). */
export class TaskNotFoundError extends Error {
  readonly taskId: string;
  constructor(taskId: string) {
    super(`Labeling task not found: ${taskId}`);
    this.name = "TaskNotFoundError";
    this.taskId = taskId;
  }
}

/**
 * Raised when no schema can be resolved for a task (neither the task's
 * `schema_id` nor the project's active schema exists) (→ 404).
 */
export class SchemaNotFoundError extends Error {
  readonly taskId: string;
  constructor(taskId: string) {
    super(`No schema found for task: ${taskId}`);
    this.name = "SchemaNotFoundError";
    this.taskId = taskId;
  }
}

/**
 * Raised when the submitted values fail validation or contain keys outside the
 * schema. Carries the `{ field, rule, message }[]` to surface (→ 422). Nothing
 * is persisted (Req 4.3).
 */
export class AnnotationValidationError extends Error {
  readonly errors: ValidationError[];
  constructor(errors: ValidationError[]) {
    super("Annotation failed validation; nothing was persisted.");
    this.name = "AnnotationValidationError";
    this.errors = errors;
  }
}

export interface SubmitAnnotationInput {
  /** Submitted field values, keyed by schema field `key`. */
  values: Record<string, unknown>;
  /** Target status; defaults to `submitted`. `draft` saves work in progress. */
  status?: SubmitStatus;
}

/**
 * Validate and persist a human annotation for a labeling task.
 *
 * Steps:
 *  1. Load the task; throw `TaskNotFoundError` if missing.
 *  2. Resolve the schema to validate against: prefer the task's own
 *     `schema_id` (the version the task was created for) and fall back to the
 *     project's currently active schema. Throw `SchemaNotFoundError` if none.
 *  3. Build the `WorkspaceSchema` shape from the stored fields and validate:
 *     reject extraneous keys (`unknown_field`) and run required/enum/range
 *     checks. Any error throws `AnnotationValidationError` (persist nothing).
 *  4. Upsert by (task, source `human`): update the existing human annotation if
 *     one exists, otherwise create a new one. The persisted `values_json` keys
 *     are a subset of the schema field keys (Property 4).
 */
export async function submitAnnotation(
  taskId: string,
  input: SubmitAnnotationInput,
  deps: SubmitAnnotationDeps = defaultDeps,
): Promise<AnnotationRow> {
  const values = input.values ?? {};
  const status: SubmitStatus = input.status ?? "submitted";

  // 1. The task must exist.
  const task = await deps.getTaskById(taskId);
  if (!task) {
    throw new TaskNotFoundError(taskId);
  }

  // 2. Resolve the schema: prefer the task's schema_id for consistency, then
  //    fall back to the project's active schema.
  let schemaRow: LabelSchemaRow | null = null;
  if (task.schema_id) {
    schemaRow = await deps.getSchemaById(task.schema_id);
  }
  if (!schemaRow) {
    schemaRow = await deps.getActiveSchema(task.project_id);
  }
  if (!schemaRow) {
    throw new SchemaNotFoundError(taskId);
  }

  // 3. Build the contract shape and validate.
  const fieldRows = await deps.listFieldsForSchema(schemaRow.id);
  const schema = workspaceSchemaFromRows(schemaRow, fieldRows);

  const errors: ValidationError[] = [];

  // Subset invariant: extraneous keys are rejected (Req 4.5 / Property 4).
  for (const key of extraneousValueKeys(schema, values)) {
    errors.push({
      field: key,
      rule: "unknown_field",
      message: `"${key}" is not a field in the active schema`,
    });
  }

  // Required / enum / range (Req 4.2).
  errors.push(...validateAnnotation(schema, values));

  if (errors.length > 0) {
    throw new AnnotationValidationError(errors);
  }

  // 4. Upsert by (task, human source). Values are already a subset of schema
  //    field keys, so values_json keys conform to the schema version (Req 4.5).
  const existing = (await deps.listAnnotationsForTask(taskId)).find(
    (a) => a.source === HUMAN_SOURCE,
  );

  if (existing) {
    const updated = await deps.updateAnnotation(existing.id, {
      status,
      values,
      // A passing submit clears any prior validation findings.
      validation: null,
    });
    // updateAnnotation only returns null if the row vanished between read and
    // write; treat that as a fresh create to avoid losing the annotation.
    if (updated) return updated;
  }

  return deps.createAnnotation({
    taskId,
    schemaId: schemaRow.id,
    source: HUMAN_SOURCE,
    status,
    values,
    validation: null,
  });
}
