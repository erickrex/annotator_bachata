/**
 * Dataset export orchestration (Requirement 6 / Property 7 — Export fidelity).
 *
 * Given a project and an optional status filter, this flow:
 *  1. loads the project (throws `ProjectNotFoundError` if missing);
 *  2. gathers the project's annotations joined to their clip reference and
 *     schema version, honoring the filter (`listAnnotationsForExport`);
 *  3. serializes them to the requested format (JSONL for this task);
 *  4. records the request in the `exports` table (Requirement 6.4); and
 *  5. returns a downloadable artifact (content + filename + content type).
 *
 * Property 7 holds by construction: the join in `listAnnotationsForExport` is
 * inner, so every exported record references an existing clip and a valid
 * schema version, and the row count equals the number of annotations matching
 * the filter (the status filter is applied in SQL).
 *
 * As with the other orchestrations in `@/lib/db`, this is written against a
 * small dependency surface (`ExportAnnotationsDeps`) rather than importing the
 * pooled client directly, so it can be exercised genuinely against an in-memory
 * store in tests without a live database.
 */

import {
  createExport,
  getProjectById,
  listAnnotationsForExport,
  type NewExport,
} from "@/lib/db";
import type { ExportAnnotationRow, ExportRow, ProjectRow } from "@/lib/db";

import { serializeJsonl, type ExportRecord } from "./jsonl";

/** Export formats this task implements. CSV / project_json are Task 17. */
export type SupportedExportFormat = "jsonl";

/** Content type used for JSONL downloads (newline-delimited JSON). */
const JSONL_CONTENT_TYPE = "application/x-ndjson";

/** The collaborators the export flow needs. Mirrors the real `@/lib/db`. */
export interface ExportAnnotationsDeps {
  getProjectById(id: string): Promise<ProjectRow | null>;
  listAnnotationsForExport(
    projectId: string,
    filter: { status?: string },
  ): Promise<ExportAnnotationRow[]>;
  createExport(input: NewExport): Promise<ExportRow>;
}

/** Production wiring: the real pooled-client query helpers. */
const defaultDeps: ExportAnnotationsDeps = {
  getProjectById,
  listAnnotationsForExport,
  createExport,
};

/** Raised when the target project does not exist (→ 404). */
export class ProjectNotFoundError extends Error {
  readonly projectId: string;
  constructor(projectId: string) {
    super(`Project not found: ${projectId}`);
    this.name = "ProjectNotFoundError";
    this.projectId = projectId;
  }
}

/** Raised when an unsupported export format is requested (→ 400). */
export class UnsupportedExportFormatError extends Error {
  readonly format: string;
  constructor(format: string) {
    super(
      `Unsupported export format: ${format}. Supported formats: jsonl.`,
    );
    this.name = "UnsupportedExportFormatError";
    this.format = format;
  }
}

export interface ExportAnnotationsInput {
  /** Export format; only `jsonl` is supported by this flow. */
  format: string;
  /** Optional annotation status filter (e.g. `submitted`, `approved`). */
  status?: string;
}

export interface ExportArtifact {
  /** The recorded `exports` row (Requirement 6.4). */
  export: ExportRow;
  /** The serialized export body. */
  content: string;
  /** Number of records (annotations) in the export. */
  recordCount: number;
  /** Suggested download filename. */
  filename: string;
  /** MIME type for the download. */
  contentType: string;
  /** The normalized format that was produced. */
  format: SupportedExportFormat;
}

/** Map a joined export row to the pure serializer's `ExportRecord` shape. */
function toExportRecord(row: ExportAnnotationRow): ExportRecord {
  return {
    clip: {
      id: row.clip_id,
      index: row.clip_index,
      title: row.clip_title,
      domain: row.clip_domain,
      renderedPath: row.rendered_clip_path,
      renderedStorageKey: row.rendered_clip_storage_key,
    },
    schemaVersion: row.schema_version,
    status: row.status,
    values: row.values_json ?? {},
    source: row.source,
  };
}

/**
 * Produce a downloadable export artifact for a project and record it in the
 * `exports` table.
 */
export async function exportProjectAnnotations(
  projectId: string,
  input: ExportAnnotationsInput,
  deps: ExportAnnotationsDeps = defaultDeps,
): Promise<ExportArtifact> {
  // Only JSONL is supported here; reject other formats clearly (Task 17 adds
  // CSV / project_json).
  if (input.format !== "jsonl") {
    throw new UnsupportedExportFormatError(input.format);
  }
  const format: SupportedExportFormat = "jsonl";

  // The project must exist.
  const project = await deps.getProjectById(projectId);
  if (!project) {
    throw new ProjectNotFoundError(projectId);
  }

  const status = input.status;
  const filter = status !== undefined ? { status } : {};

  // Gather annotations joined to clip ref + schema version, honoring the
  // filter. The inner join + SQL filter give Property 7 by construction.
  const rows = await deps.listAnnotationsForExport(projectId, filter);
  const content = serializeJsonl(rows.map(toExportRecord));

  // Record the export request (Requirement 6.4). The filters_json captures the
  // applied filter so the export is reproducible/auditable.
  const exportRow = await deps.createExport({
    projectId,
    format,
    status: "succeeded",
    filters: status !== undefined ? { status } : {},
    completedAt: new Date(),
  });

  const filename = `${projectId}-annotations.jsonl`;

  return {
    export: exportRow,
    content,
    recordCount: rows.length,
    filename,
    contentType: JSONL_CONTENT_TYPE,
    format,
  };
}
