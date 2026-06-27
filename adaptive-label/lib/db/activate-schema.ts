/**
 * Schema activation — immutable versioning (Requirement 1.7 / Property 2).
 *
 * Activation turns a validated `WorkspaceSchema` into a new, immutable
 * `label_schemas` version plus its `label_fields` rows. The core rule is that a
 * version is *append-only*: activating again always creates a fresh
 * `(project_id, version)` (the version increments) and never mutates the field
 * definitions of any prior version. The previously-active version is retired
 * via a status-only update (see `retireActiveSchemas`), which keeps a single
 * `active` version without rewriting history.
 *
 * The logic here is written against a small dependency surface
 * (`SchemaActivationDeps`) rather than importing the pooled client directly, so
 * it can be exercised genuinely against an in-memory store in tests (modelling
 * the real `unique(project_id, version)` constraint and the insert behaviour)
 * without a live database. In production the default deps are the real
 * `@/lib/db` query helpers.
 */

import type { PoolClient } from "pg";
import type { ZodIssue } from "zod";

import { WorkspaceSchema } from "@/lib/schemas/workspace";

import {
  createLabelField,
  createLabelSchema,
  getNextSchemaVersion,
  getProjectById,
  retireActiveSchemas,
  withTransaction,
  type NewLabelField,
  type NewLabelSchema,
} from "./queries";
import type { LabelFieldRow, LabelSchemaRow, ProjectRow } from "./types";

/** The collaborators activation needs. Mirrors the real `@/lib/db` helpers. */
export interface SchemaActivationDeps {
  getProjectById(id: string): Promise<ProjectRow | null>;
  getNextSchemaVersion(projectId: string): Promise<number>;
  withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T>;
  retireActiveSchemas(projectId: string, client?: PoolClient): Promise<number>;
  createLabelSchema(
    input: NewLabelSchema,
    client?: PoolClient,
  ): Promise<LabelSchemaRow>;
  createLabelField(
    input: NewLabelField,
    client?: PoolClient,
  ): Promise<LabelFieldRow>;
}

/** Production wiring: the real pooled-client query helpers. */
const defaultDeps: SchemaActivationDeps = {
  getProjectById,
  getNextSchemaVersion,
  withTransaction,
  retireActiveSchemas,
  createLabelSchema,
  createLabelField,
};

/** Raised when the supplied schema fails `WorkspaceSchema` validation. */
export class SchemaActivationValidationError extends Error {
  readonly issues: ZodIssue[];
  constructor(issues: ZodIssue[]) {
    super("Schema failed validation; nothing was persisted.");
    this.name = "SchemaActivationValidationError";
    this.issues = issues;
  }
}

/** Raised when the target project does not exist. */
export class ProjectNotFoundError extends Error {
  readonly projectId: string;
  constructor(projectId: string) {
    super(`Project not found: ${projectId}`);
    this.name = "ProjectNotFoundError";
    this.projectId = projectId;
  }
}

export interface ActivateSchemaInput {
  /** The schema to activate. Re-validated against `WorkspaceSchema` here. */
  schema: unknown;
  /** The originating generation prompt to record on the version (Req 1.7). */
  generationPrompt?: string | null;
}

export interface ActivatedSchema {
  schema: LabelSchemaRow;
  fields: LabelFieldRow[];
}

/**
 * Persist a validated `WorkspaceSchema` as the next immutable version for a
 * project, plus its fields, atomically.
 *
 * Steps:
 *  1. Re-validate the schema (defense-in-depth). On failure nothing is
 *     persisted and a `SchemaActivationValidationError` is thrown (Req 1.3).
 *  2. Confirm the project exists.
 *  3. Compute the next version (`max(version) + 1`).
 *  4. In a single transaction: retire the prior active version (status only),
 *     insert the new `label_schemas` row (status `active`, with the generation
 *     prompt and `activated_at`), then insert one `label_fields` row per field
 *     with `order_index` set to its array position.
 *
 * Never mutates an existing version's field definitions (Requirement 1.7 /
 * Property 2).
 */
export async function activateWorkspaceSchema(
  projectId: string,
  input: ActivateSchemaInput,
  deps: SchemaActivationDeps = defaultDeps,
): Promise<ActivatedSchema> {
  // 1. Defense-in-depth validation — reject (and persist nothing) if invalid.
  const parsed = WorkspaceSchema.safeParse(input.schema);
  if (!parsed.success) {
    throw new SchemaActivationValidationError(parsed.error.issues);
  }
  const schema = parsed.data;

  // 2. The project must exist before we allocate a version.
  const project = await deps.getProjectById(projectId);
  if (!project) {
    throw new ProjectNotFoundError(projectId);
  }

  // 3. Allocate the next immutable version number.
  const version = await deps.getNextSchemaVersion(projectId);

  // 4. Insert the version + its fields atomically.
  return deps.withTransaction(async (client) => {
    // Retire prior active versions (status-only; never rewrites their fields).
    await deps.retireActiveSchemas(projectId, client);

    const schemaRow = await deps.createLabelSchema(
      {
        projectId,
        version,
        name: schema.workspaceName,
        timelineMode: schema.timelineMode,
        status: "active",
        generationPrompt: input.generationPrompt ?? null,
        activatedAt: new Date(),
      },
      client,
    );

    // Insert fields sequentially so `order_index` matches array position and
    // any unique-key violation aborts the whole transaction.
    const fields: LabelFieldRow[] = [];
    for (const [index, field] of schema.fields.entries()) {
      const row = await deps.createLabelField(
        {
          schemaId: schemaRow.id,
          key: field.key,
          label: field.label,
          help: field.help,
          fieldType: field.type,
          required: field.required,
          options: field.options ?? [],
          min: field.min,
          max: field.max,
          group: field.group,
          orderIndex: index,
        },
        client,
      );
      fields.push(row);
    }

    return { schema: schemaRow, fields };
  });
}
