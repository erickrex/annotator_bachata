import { describe, it, expect } from "vitest";
import type { PoolClient } from "pg";

import {
  activateWorkspaceSchema,
  ProjectNotFoundError,
  SchemaActivationValidationError,
  type SchemaActivationDeps,
} from "./activate-schema";
import { PRESETS } from "@/lib/schemas/workspace";
import type { LabelFieldRow, LabelSchemaRow, ProjectRow } from "./types";

/**
 * Integration test for schema activation immutable versioning.
 *
 * Validates: Requirements 1.7 (Property 2 — version immutability)
 *
 * A live Aurora database is not available in this environment, so these tests
 * run the real `activateWorkspaceSchema` orchestration against an in-memory
 * store that faithfully models the database behaviour the property depends on:
 *   - `unique (project_id, version)` on `label_schemas` (duplicate inserts throw)
 *   - `unique (schema_id, key)` on `label_fields`
 *   - transactional rollback (a failed activation persists nothing)
 *   - inserts return immutable rows; nothing ever issues an UPDATE against an
 *     existing version's `label_fields`
 * This exercises the immutability invariant genuinely (the version increments
 * and a prior version's fields are never rewritten) without a network DB.
 */

interface FakeStore {
  deps: SchemaActivationDeps;
  projects: ProjectRow[];
  schemas: LabelSchemaRow[];
  fields: LabelFieldRow[];
}

/**
 * Build an in-memory store backed by plain arrays. The deps mirror the real
 * `@/lib/db` helpers, including the unique constraints and transaction
 * semantics that the immutability property relies on.
 */
function createFakeStore(): FakeStore {
  const projects: ProjectRow[] = [];
  const schemas: LabelSchemaRow[] = [];
  const fields: LabelFieldRow[] = [];
  let idCounter = 0;
  const nextId = (prefix: string) => `${prefix}-${(idCounter += 1)}`;

  // The fake client is never used directly; it only satisfies the signature.
  const fakeClient = {} as PoolClient;

  const deps: SchemaActivationDeps = {
    async getProjectById(id) {
      return projects.find((p) => p.id === id) ?? null;
    },

    async getNextSchemaVersion(projectId) {
      const versions = schemas
        .filter((s) => s.project_id === projectId)
        .map((s) => s.version);
      return (versions.length ? Math.max(...versions) : 0) + 1;
    },

    async withTransaction(fn) {
      // Model rollback: snapshot mutable state and restore it on failure so a
      // failed activation persists nothing.
      const snapSchemas = structuredClone(schemas);
      const snapFields = structuredClone(fields);
      try {
        return await fn(fakeClient);
      } catch (error) {
        schemas.length = 0;
        schemas.push(...snapSchemas);
        fields.length = 0;
        fields.push(...snapFields);
        throw error;
      }
    },

    async retireActiveSchemas(projectId) {
      // Status-only transition; never touches label_fields.
      let changed = 0;
      for (const s of schemas) {
        if (s.project_id === projectId && s.status === "active") {
          s.status = "retired";
          changed += 1;
        }
      }
      return changed;
    },

    async createLabelSchema(input) {
      // Enforce unique (project_id, version) — versions are immutable.
      if (
        schemas.some(
          (s) =>
            s.project_id === input.projectId && s.version === input.version,
        )
      ) {
        throw new Error(
          `duplicate key value violates unique constraint ` +
            `"label_schemas_project_id_version_key" (${input.projectId}, ${input.version})`,
        );
      }
      const row: LabelSchemaRow = {
        id: nextId("schema"),
        project_id: input.projectId,
        version: input.version,
        name: input.name,
        timeline_mode: input.timelineMode,
        status: input.status ?? "active",
        generation_prompt: input.generationPrompt ?? null,
        created_at: new Date(),
        activated_at: input.activatedAt ?? null,
      };
      schemas.push(row);
      return row;
    },

    async createLabelField(input) {
      // Enforce unique (schema_id, key).
      if (
        fields.some(
          (f) => f.schema_id === input.schemaId && f.key === input.key,
        )
      ) {
        throw new Error(
          `duplicate key value violates unique constraint ` +
            `"label_fields_schema_id_key_key"`,
        );
      }
      const row: LabelFieldRow = {
        id: nextId("field"),
        schema_id: input.schemaId,
        key: input.key,
        label: input.label,
        help: input.help ?? null,
        field_type: input.fieldType,
        required: input.required ?? false,
        options_json: input.options ?? [],
        min: input.min != null ? String(input.min) : null,
        max: input.max != null ? String(input.max) : null,
        field_group: input.group ?? null,
        order_index: input.orderIndex ?? 0,
      };
      fields.push(row);
      return row;
    },
  };

  return { deps, projects, schemas, fields };
}

function seedProject(store: FakeStore, id = "proj-1"): ProjectRow {
  const project: ProjectRow = {
    id,
    name: "Demo",
    domain: "bachata",
    status: "active",
    created_at: new Date(),
  };
  store.projects.push(project);
  return project;
}

describe("activateWorkspaceSchema — version immutability (Property 2)", () => {
  it("activating twice creates two distinct (project_id, version) rows with incrementing versions, and never mutates the first version's fields", async () => {
    const store = createFakeStore();
    const project = seedProject(store);

    // First activation → version 1.
    const first = await activateWorkspaceSchema(
      project.id,
      { schema: PRESETS.bachata, generationPrompt: "describe a bachata set" },
      store.deps,
    );
    expect(first.schema.version).toBe(1);
    expect(first.schema.status).toBe("active");
    expect(first.fields.length).toBe(PRESETS.bachata.fields.length);

    // Snapshot version 1's fields immediately after activation.
    const v1Snapshot = structuredClone(
      store.fields.filter((f) => f.schema_id === first.schema.id),
    );

    // Second activation (a different/edited schema) → version 2.
    const second = await activateWorkspaceSchema(
      project.id,
      {
        schema: PRESETS.sign_language,
        generationPrompt: "now switch to sign language",
      },
      store.deps,
    );
    expect(second.schema.version).toBe(2);

    // Two distinct schema rows with distinct ids and versions.
    expect(second.schema.id).not.toBe(first.schema.id);
    const versionsForProject = store.schemas
      .filter((s) => s.project_id === project.id)
      .map((s) => s.version)
      .sort();
    expect(versionsForProject).toEqual([1, 2]);

    // unique (project_id, version): no duplicate (project, version) pairs.
    const pairs = store.schemas.map((s) => `${s.project_id}#${s.version}`);
    expect(new Set(pairs).size).toBe(pairs.length);

    // Version 1's fields are byte-for-byte unchanged after the second
    // activation: immutability holds (no UPDATE rewrote the prior version).
    const v1After = store.fields.filter(
      (f) => f.schema_id === first.schema.id,
    );
    expect(v1After).toEqual(v1Snapshot);

    // The new version owns its own, separate field rows.
    const v2Fields = store.fields.filter(
      (f) => f.schema_id === second.schema.id,
    );
    expect(v2Fields.length).toBe(PRESETS.sign_language.fields.length);
    expect(v2Fields.every((f) => f.schema_id === second.schema.id)).toBe(true);
  });

  it("retires the prior active version (status only) so exactly one version stays active", async () => {
    const store = createFakeStore();
    const project = seedProject(store);

    const first = await activateWorkspaceSchema(
      project.id,
      { schema: PRESETS.bachata },
      store.deps,
    );
    await activateWorkspaceSchema(
      project.id,
      { schema: PRESETS.sign_language },
      store.deps,
    );

    const active = store.schemas.filter(
      (s) => s.project_id === project.id && s.status === "active",
    );
    expect(active).toHaveLength(1);
    expect(active[0].version).toBe(2);

    // The prior version still exists, only its status changed to 'retired';
    // its fields remain present and untouched.
    const retired = store.schemas.find((s) => s.id === first.schema.id);
    expect(retired?.status).toBe("retired");
    expect(
      store.fields.filter((f) => f.schema_id === first.schema.id).length,
    ).toBe(PRESETS.bachata.fields.length);
  });

  it("preserves order_index by field array position", async () => {
    const store = createFakeStore();
    const project = seedProject(store);

    const { schema, fields } = await activateWorkspaceSchema(
      project.id,
      { schema: PRESETS.bachata },
      store.deps,
    );

    PRESETS.bachata.fields.forEach((field, index) => {
      const row = fields.find((f) => f.key === field.key);
      expect(row?.order_index).toBe(index);
      expect(row?.schema_id).toBe(schema.id);
    });
  });

  it("rejects an invalid schema and persists nothing (Req 1.3)", async () => {
    const store = createFakeStore();
    const project = seedProject(store);

    const invalid = {
      domain: "bachata",
      workspaceName: "Too few fields",
      timelineMode: "beat_grid",
      fields: [{ key: "only_one", label: "X", type: "text" }],
      workflowStages: ["draft"],
    };

    await expect(
      activateWorkspaceSchema(project.id, { schema: invalid }, store.deps),
    ).rejects.toBeInstanceOf(SchemaActivationValidationError);

    // Nothing persisted.
    expect(store.schemas).toHaveLength(0);
    expect(store.fields).toHaveLength(0);
  });

  it("throws ProjectNotFoundError for an unknown project (persists nothing)", async () => {
    const store = createFakeStore();

    await expect(
      activateWorkspaceSchema(
        "missing-project",
        { schema: PRESETS.bachata },
        store.deps,
      ),
    ).rejects.toBeInstanceOf(ProjectNotFoundError);

    expect(store.schemas).toHaveLength(0);
    expect(store.fields).toHaveLength(0);
  });

  it("the modelled unique(project_id, version) constraint rejects a duplicate version insert", async () => {
    const store = createFakeStore();
    const project = seedProject(store);

    await store.deps.createLabelSchema({
      projectId: project.id,
      version: 1,
      name: "v1",
      timelineMode: "beat_grid",
      status: "active",
    });

    await expect(
      store.deps.createLabelSchema({
        projectId: project.id,
        version: 1,
        name: "dup",
        timelineMode: "beat_grid",
        status: "active",
      }),
    ).rejects.toThrow(/unique constraint/);
  });

  it("rolls back the whole version when a field insert fails mid-transaction (atomicity)", async () => {
    const store = createFakeStore();
    const project = seedProject(store);

    // Simulate a mid-transaction failure by wrapping deps to throw on the 3rd
    // field insert, then assert nothing from this activation remains.
    let inserts = 0;
    const failingDeps: SchemaActivationDeps = {
      ...store.deps,
      async createLabelField(input, client) {
        inserts += 1;
        if (inserts === 3) {
          throw new Error("simulated field insert failure");
        }
        return store.deps.createLabelField(input, client);
      },
    };

    await expect(
      activateWorkspaceSchema(
        project.id,
        { schema: PRESETS.bachata },
        failingDeps,
      ),
    ).rejects.toThrow(/simulated field insert failure/);

    // Rollback restored the snapshot: no schema row and no fields persisted.
    expect(store.schemas).toHaveLength(0);
    expect(store.fields).toHaveLength(0);
  });
});
