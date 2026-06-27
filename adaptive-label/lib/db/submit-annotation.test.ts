import { describe, it, expect } from "vitest";

import {
  AnnotationValidationError,
  SchemaNotFoundError,
  submitAnnotation,
  TaskNotFoundError,
  type SubmitAnnotationDeps,
} from "./submit-annotation";
import type {
  AnnotationRow,
  LabelFieldRow,
  LabelSchemaRow,
  LabelingTaskRow,
} from "./types";

/**
 * Integration test for annotation save/submit.
 *
 * Validates: Requirements 4.1, 4.4, 4.5 (Property 4 — annotation/schema
 * consistency)
 *
 * A live Aurora database is not available here, so these tests run the real
 * `submitAnnotation` orchestration against an in-memory store that models the
 * task/schema lookup and the annotation create/update behaviour the flow
 * depends on. This exercises the validation gate, the values-keys-subset
 * invariant, the human-source upsert, and the not-found paths genuinely,
 * without a network DB.
 */

interface FakeStore {
  deps: SubmitAnnotationDeps;
  tasks: LabelingTaskRow[];
  schemas: LabelSchemaRow[];
  fields: LabelFieldRow[];
  annotations: AnnotationRow[];
}

function createFakeStore(): FakeStore {
  const tasks: LabelingTaskRow[] = [];
  const schemas: LabelSchemaRow[] = [];
  const fields: LabelFieldRow[] = [];
  const annotations: AnnotationRow[] = [];
  let idCounter = 0;
  const nextId = (prefix: string) => `${prefix}-${(idCounter += 1)}`;

  const deps: SubmitAnnotationDeps = {
    async getTaskById(id) {
      return tasks.find((t) => t.id === id) ?? null;
    },
    async getSchemaById(id) {
      return schemas.find((s) => s.id === id) ?? null;
    },
    async getActiveSchema(projectId) {
      return (
        schemas.find(
          (s) => s.project_id === projectId && s.status === "active",
        ) ?? null
      );
    },
    async listFieldsForSchema(schemaId) {
      return fields
        .filter((f) => f.schema_id === schemaId)
        .sort((a, b) => a.order_index - b.order_index);
    },
    async listAnnotationsForTask(taskId) {
      return annotations.filter((a) => a.task_id === taskId);
    },
    async createAnnotation(input) {
      const row: AnnotationRow = {
        id: nextId("annotation"),
        task_id: input.taskId,
        schema_id: input.schemaId,
        source: input.source ?? "human",
        status: input.status ?? "submitted",
        values_json: input.values ?? {},
        confidence_json: input.confidence ?? null,
        validation_json: input.validation ?? null,
        created_at: new Date(),
        updated_at: new Date(),
      };
      annotations.push(row);
      return row;
    },
    async updateAnnotation(id, patch) {
      const row = annotations.find((a) => a.id === id);
      if (!row) return null;
      if (patch.status !== undefined) row.status = patch.status;
      if (patch.values !== undefined) row.values_json = patch.values;
      if (patch.confidence !== undefined) row.confidence_json = patch.confidence;
      if (patch.validation !== undefined) row.validation_json = patch.validation;
      row.updated_at = new Date();
      return row;
    },
  };

  return { deps, tasks, schemas, fields, annotations };
}

const PROJECT_ID = "proj-1";
const SCHEMA_ID = "schema-1";
const TASK_ID = "task-1";

function fieldRow(overrides: Partial<LabelFieldRow>): LabelFieldRow {
  return {
    id: `field-${overrides.key ?? "x"}`,
    schema_id: SCHEMA_ID,
    key: "move_name",
    label: "Move name",
    help: null,
    field_type: "text",
    required: false,
    options_json: [],
    min: null,
    max: null,
    field_group: null,
    order_index: 0,
    ...overrides,
  };
}

/** Seed a project task + active schema with a small bachata-like field set. */
function seedTaskAndSchema(store: FakeStore): void {
  store.schemas.push({
    id: SCHEMA_ID,
    project_id: PROJECT_ID,
    version: 1,
    name: "Bachata Move Annotation",
    timeline_mode: "beat_grid",
    status: "active",
    generation_prompt: null,
    created_at: new Date(),
    activated_at: new Date(),
  });
  store.fields.push(
    fieldRow({ key: "move_name", required: true, order_index: 0 }),
    fieldRow({
      key: "move_category",
      field_type: "select",
      options_json: ["basic", "turn", "dip"],
      order_index: 1,
    }),
    fieldRow({
      key: "difficulty",
      field_type: "slider",
      min: "1",
      max: "10",
      order_index: 2,
    }),
  );
  store.tasks.push({
    id: TASK_ID,
    project_id: PROJECT_ID,
    clip_id: "clip-1",
    schema_id: SCHEMA_ID,
    status: "queued",
    created_at: new Date(),
  });
}

describe("submitAnnotation", () => {
  it("persists a valid submit with source human and subset keys (Req 4.4, 4.5)", async () => {
    const store = createFakeStore();
    seedTaskAndSchema(store);

    const row = await submitAnnotation(
      TASK_ID,
      { values: { move_name: "cambré", move_category: "turn", difficulty: 5 } },
      store.deps,
    );

    expect(row.source).toBe("human");
    expect(row.status).toBe("submitted");
    expect(row.schema_id).toBe(SCHEMA_ID);
    // values_json keys are a subset of the schema field keys (Property 4).
    const fieldKeys = new Set(["move_name", "move_category", "difficulty"]);
    expect(Object.keys(row.values_json).every((k) => fieldKeys.has(k))).toBe(
      true,
    );
    expect(store.annotations).toHaveLength(1);
  });

  it("supports saving a draft via the status field", async () => {
    const store = createFakeStore();
    seedTaskAndSchema(store);

    const row = await submitAnnotation(
      TASK_ID,
      { values: { move_name: "wip" }, status: "draft" },
      store.deps,
    );
    expect(row.status).toBe("draft");
  });

  it("blocks an invalid submit (missing required) with errors and persists nothing (Req 4.3)", async () => {
    const store = createFakeStore();
    seedTaskAndSchema(store);

    await expect(
      submitAnnotation(
        TASK_ID,
        { values: { move_category: "turn" } },
        store.deps,
      ),
    ).rejects.toBeInstanceOf(AnnotationValidationError);

    expect(store.annotations).toHaveLength(0);

    // The error carries the failing rule for the required field.
    try {
      await submitAnnotation(TASK_ID, { values: {} }, store.deps);
    } catch (error) {
      const err = error as AnnotationValidationError;
      expect(err.errors.some((e) => e.field === "move_name" && e.rule === "required")).toBe(true);
    }
  });

  it("rejects extraneous keys not in the schema and persists nothing (Req 4.5 / Property 4)", async () => {
    const store = createFakeStore();
    seedTaskAndSchema(store);

    try {
      await submitAnnotation(
        TASK_ID,
        { values: { move_name: "ok", not_a_field: "x" } },
        store.deps,
      );
      throw new Error("expected AnnotationValidationError");
    } catch (error) {
      expect(error).toBeInstanceOf(AnnotationValidationError);
      const err = error as AnnotationValidationError;
      expect(
        err.errors.some(
          (e) => e.field === "not_a_field" && e.rule === "unknown_field",
        ),
      ).toBe(true);
    }
    expect(store.annotations).toHaveLength(0);
  });

  it("rejects an enum value outside the field options", async () => {
    const store = createFakeStore();
    seedTaskAndSchema(store);

    await expect(
      submitAnnotation(
        TASK_ID,
        { values: { move_name: "ok", move_category: "not_an_option" } },
        store.deps,
      ),
    ).rejects.toBeInstanceOf(AnnotationValidationError);
    expect(store.annotations).toHaveLength(0);
  });

  it("updates the existing human annotation instead of creating a second (upsert)", async () => {
    const store = createFakeStore();
    seedTaskAndSchema(store);

    const first = await submitAnnotation(
      TASK_ID,
      { values: { move_name: "first" }, status: "draft" },
      store.deps,
    );
    const second = await submitAnnotation(
      TASK_ID,
      { values: { move_name: "second" }, status: "submitted" },
      store.deps,
    );

    expect(store.annotations).toHaveLength(1);
    expect(second.id).toBe(first.id);
    expect(second.values_json).toEqual({ move_name: "second" });
    expect(second.status).toBe("submitted");
  });

  it("throws TaskNotFoundError for an unknown task (persists nothing)", async () => {
    const store = createFakeStore();
    seedTaskAndSchema(store);

    await expect(
      submitAnnotation("missing-task", { values: {} }, store.deps),
    ).rejects.toBeInstanceOf(TaskNotFoundError);
    expect(store.annotations).toHaveLength(0);
  });

  it("falls back to the project active schema when the task's schema_id is missing", async () => {
    const store = createFakeStore();
    seedTaskAndSchema(store);
    // Point the task at a non-existent schema id; active schema should resolve.
    store.tasks[0].schema_id = "gone";

    const row = await submitAnnotation(
      TASK_ID,
      { values: { move_name: "ok" } },
      store.deps,
    );
    expect(row.schema_id).toBe(SCHEMA_ID);
  });

  it("throws SchemaNotFoundError when no schema can be resolved", async () => {
    const store = createFakeStore();
    // Task with no resolvable schema and no active schema for the project.
    store.tasks.push({
      id: TASK_ID,
      project_id: PROJECT_ID,
      clip_id: "clip-1",
      schema_id: "gone",
      status: "queued",
      created_at: new Date(),
    });

    await expect(
      submitAnnotation(TASK_ID, { values: {} }, store.deps),
    ).rejects.toBeInstanceOf(SchemaNotFoundError);
  });
});
