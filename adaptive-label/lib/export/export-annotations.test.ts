import { describe, it, expect } from "vitest";

import {
  exportProjectAnnotations,
  ProjectNotFoundError,
  UnsupportedExportFormatError,
  type ExportAnnotationsDeps,
} from "./export-annotations";
import type {
  ExportAnnotationRow,
  ExportRow,
  NewExport,
  ProjectRow,
} from "@/lib/db";

/**
 * Integration test for JSONL dataset export.
 *
 * Validates: Requirements 6.1, 6.2 (Property 7 — Export fidelity)
 *
 * A live Aurora database is not available here, so these tests run the real
 * `exportProjectAnnotations` orchestration against an in-memory store. The
 * store models the annotation→task→clip and annotation→schema joins that the
 * real `listAnnotationsForExport` SQL performs, including the inner-join
 * semantics (annotations whose clip or schema is missing are excluded) and the
 * optional status filter. This lets us assert Property 7 genuinely:
 *  - every exported record references an existing clip and a valid schema
 *    version; and
 *  - the record count equals the number of annotations matching the filter
 *    (tested for both the unfiltered and filtered cases).
 * It also asserts an `exports` row is recorded (Requirement 6.4).
 */

interface FakeAnnotation {
  id: string;
  projectId: string;
  clipId: string;
  schemaId: string;
  status: string;
  source: string;
  values: Record<string, unknown>;
  createdAt: Date;
}

interface FakeClip {
  id: string;
  clipIndex: number;
  title: string | null;
  domain: string;
}

interface FakeSchema {
  id: string;
  version: number;
}

interface FakeStore {
  deps: ExportAnnotationsDeps;
  exports: ExportRow[];
}

function createFakeStore(options: {
  project: ProjectRow | null;
  clips: FakeClip[];
  schemas: FakeSchema[];
  annotations: FakeAnnotation[];
}): FakeStore {
  const exports: ExportRow[] = [];
  let idCounter = 0;

  const deps: ExportAnnotationsDeps = {
    async getProjectById(id) {
      return options.project && options.project.id === id
        ? options.project
        : null;
    },
    async listAnnotationsForExport(projectId, filter) {
      // Model the real SQL: inner join to clips + schemas (so an annotation
      // whose clip or schema is missing is dropped), filter by project and the
      // optional status, newest first.
      const rows: ExportAnnotationRow[] = [];
      for (const a of options.annotations) {
        if (a.projectId !== projectId) continue;
        if (filter.status !== undefined && a.status !== filter.status) continue;
        const clip = options.clips.find((c) => c.id === a.clipId);
        const schema = options.schemas.find((s) => s.id === a.schemaId);
        if (!clip || !schema) continue; // inner join semantics
        rows.push({
          annotation_id: a.id,
          status: a.status,
          source: a.source,
          values_json: a.values,
          created_at: a.createdAt,
          clip_id: clip.id,
          clip_index: clip.clipIndex,
          clip_title: clip.title,
          clip_domain: clip.domain,
          schema_id: schema.id,
          schema_version: schema.version,
        });
      }
      rows.sort((x, y) => y.created_at.getTime() - x.created_at.getTime());
      return rows;
    },
    async createExport(input: NewExport) {
      const row: ExportRow = {
        id: `export-${(idCounter += 1)}`,
        project_id: input.projectId,
        format: input.format,
        status: input.status ?? "succeeded",
        storage_key: input.storageKey ?? null,
        filters_json: input.filters ?? {},
        created_at: new Date(),
        completed_at: input.completedAt ?? null,
      };
      exports.push(row);
      return row;
    },
  };

  return { deps, exports };
}

const PROJECT: ProjectRow = {
  id: "project-1",
  name: "Bachata",
  domain: "bachata",
  status: "active",
  created_at: new Date(),
};

const CLIPS: FakeClip[] = [
  { id: "clip-1", clipIndex: 1, title: "Intro", domain: "bachata" },
  { id: "clip-2", clipIndex: 2, title: null, domain: "bachata" },
];

const SCHEMAS: FakeSchema[] = [{ id: "schema-1", version: 1 }];

function buildAnnotations(): FakeAnnotation[] {
  return [
    {
      id: "a-1",
      projectId: "project-1",
      clipId: "clip-1",
      schemaId: "schema-1",
      status: "submitted",
      source: "human",
      values: { move_name: "basic" },
      createdAt: new Date("2024-01-01T00:00:00Z"),
    },
    {
      id: "a-2",
      projectId: "project-1",
      clipId: "clip-2",
      schemaId: "schema-1",
      status: "approved",
      source: "human",
      values: { move_name: "cambré" },
      createdAt: new Date("2024-01-02T00:00:00Z"),
    },
    {
      id: "a-3",
      projectId: "project-1",
      clipId: "clip-1",
      schemaId: "schema-1",
      status: "submitted",
      source: "human",
      values: { move_name: "turn" },
      createdAt: new Date("2024-01-03T00:00:00Z"),
    },
  ];
}

describe("exportProjectAnnotations (JSONL)", () => {
  it("exports every matching annotation and records an exports row (unfiltered)", async () => {
    const annotations = buildAnnotations();
    const store = createFakeStore({
      project: PROJECT,
      clips: CLIPS,
      schemas: SCHEMAS,
      annotations,
    });

    const artifact = await exportProjectAnnotations(
      "project-1",
      { format: "jsonl" },
      store.deps,
    );

    // Property 7 (count): record count == number of annotations matching the
    // (empty) filter.
    expect(artifact.recordCount).toBe(annotations.length);

    const lines = artifact.content.split("\n");
    expect(lines).toHaveLength(annotations.length);

    const clipIds = new Set(CLIPS.map((c) => c.id));
    const schemaVersions = new Set(SCHEMAS.map((s) => s.version));
    for (const line of lines) {
      const parsed = JSON.parse(line);
      // Property 7 (fidelity): references an existing clip ...
      expect(clipIds.has(parsed.clip_id)).toBe(true);
      // ... and a valid schema version.
      expect(schemaVersions.has(parsed.schema_version)).toBe(true);
      expect(parsed.status).toBeDefined();
      expect(parsed.values).toBeDefined();
    }

    // Requirement 6.4: an exports row was recorded.
    expect(store.exports).toHaveLength(1);
    expect(store.exports[0].format).toBe("jsonl");
    expect(store.exports[0].project_id).toBe("project-1");
    expect(artifact.export.id).toBe(store.exports[0].id);
    expect(artifact.contentType).toBe("application/x-ndjson");
    expect(artifact.filename).toContain(".jsonl");
  });

  it("limits the export to the filtered status and records that filter", async () => {
    const annotations = buildAnnotations();
    const expectedSubmitted = annotations.filter(
      (a) => a.status === "submitted",
    ).length;

    const store = createFakeStore({
      project: PROJECT,
      clips: CLIPS,
      schemas: SCHEMAS,
      annotations,
    });

    const artifact = await exportProjectAnnotations(
      "project-1",
      { format: "jsonl", status: "submitted" },
      store.deps,
    );

    // Property 7 (count): filtered record count == annotations matching filter.
    expect(artifact.recordCount).toBe(expectedSubmitted);
    expect(expectedSubmitted).toBeLessThan(annotations.length);

    for (const line of artifact.content.split("\n")) {
      expect(JSON.parse(line).status).toBe("submitted");
    }

    // The recorded export captures the filter (Requirement 6.4).
    expect(store.exports[0].filters_json).toEqual({ status: "submitted" });
  });

  it("excludes annotations whose clip or schema is missing (fidelity)", async () => {
    const annotations = buildAnnotations();
    // Add an annotation pointing at a non-existent clip; it must not appear.
    annotations.push({
      id: "a-orphan",
      projectId: "project-1",
      clipId: "clip-missing",
      schemaId: "schema-1",
      status: "submitted",
      source: "human",
      values: {},
      createdAt: new Date("2024-01-04T00:00:00Z"),
    });

    const store = createFakeStore({
      project: PROJECT,
      clips: CLIPS,
      schemas: SCHEMAS,
      annotations,
    });

    const artifact = await exportProjectAnnotations(
      "project-1",
      { format: "jsonl" },
      store.deps,
    );

    // The orphan is excluded: count equals only the join-satisfying rows.
    expect(artifact.recordCount).toBe(annotations.length - 1);
    for (const line of artifact.content.split("\n")) {
      expect(JSON.parse(line).clip_id).not.toBe("clip-missing");
    }
  });

  it("yields empty content for a project with no annotations", async () => {
    const store = createFakeStore({
      project: PROJECT,
      clips: CLIPS,
      schemas: SCHEMAS,
      annotations: [],
    });

    const artifact = await exportProjectAnnotations(
      "project-1",
      { format: "jsonl" },
      store.deps,
    );

    expect(artifact.recordCount).toBe(0);
    expect(artifact.content).toBe("");
    // An exports row is still recorded for the request (Requirement 6.4).
    expect(store.exports).toHaveLength(1);
  });

  it("throws ProjectNotFoundError for an unknown project", async () => {
    const store = createFakeStore({
      project: null,
      clips: CLIPS,
      schemas: SCHEMAS,
      annotations: [],
    });

    await expect(
      exportProjectAnnotations("missing", { format: "jsonl" }, store.deps),
    ).rejects.toBeInstanceOf(ProjectNotFoundError);
    // Nothing recorded when the project is missing.
    expect(store.exports).toHaveLength(0);
  });

  it("throws UnsupportedExportFormatError for non-jsonl formats", async () => {
    const store = createFakeStore({
      project: PROJECT,
      clips: CLIPS,
      schemas: SCHEMAS,
      annotations: buildAnnotations(),
    });

    await expect(
      exportProjectAnnotations("project-1", { format: "csv" }, store.deps),
    ).rejects.toBeInstanceOf(UnsupportedExportFormatError);
    expect(store.exports).toHaveLength(0);
  });
});
