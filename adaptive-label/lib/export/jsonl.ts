/**
 * Pure JSONL (newline-delimited JSON) serializer for dataset exports
 * (Requirements 6.1, 6.2).
 *
 * This module is intentionally free of any database, network, or Next.js
 * dependency: it turns an array of already-gathered export records into a
 * single JSONL string. Keeping it pure makes it trivially unit-testable and
 * keeps the "what does an export row look like" contract in one place.
 *
 * JSONL contract:
 * - one JSON object per line, separated by `\n`;
 * - each line is a complete, standalone, valid JSON value;
 * - empty input produces empty output (no trailing newline);
 * - field ordering is stable so output is deterministic for a given input.
 *
 * Each emitted record includes (Requirement 6.2): the clip reference, the
 * schema version, the annotation field values, and the annotation status.
 */

/** The clip reference embedded in an export record. */
export interface ExportClipRef {
  /** `clips.id` — the stable clip reference. */
  id: string;
  /** `clips.clip_index` — the clip's ordinal within its project. */
  index: number;
  /** `clips.title`, if any. */
  title: string | null;
  /** `clips.domain` (e.g. `bachata`, `sign_language`). */
  domain: string;
  /** Local rendered MP4 path, when the clip has been rendered. */
  renderedPath?: string | null;
  /** Rendered MP4 storage key, when the clip has been rendered. */
  renderedStorageKey?: string | null;
}

/**
 * One export record: a single annotation paired with its clip reference and
 * schema version. This is the pure-data shape the serializer consumes; the
 * orchestration layer builds it from joined database rows.
 */
export interface ExportRecord {
  /** Reference to the clip the annotation belongs to (Requirement 6.2). */
  clip: ExportClipRef;
  /** Immutable schema version the annotation was made against (Req 6.2). */
  schemaVersion: number;
  /** Annotation status (`draft` | `submitted` | `approved` | `rejected`). */
  status: string;
  /** Annotation field values, keyed by schema field `key` (Req 6.2). */
  values: Record<string, unknown>;
  /** Annotation source (`human` | `ai_draft`); useful provenance for ML use. */
  source?: string;
}

/**
 * The JSON object shape written per line. Declared explicitly (rather than
 * relying on object-literal key order) so the on-disk format is stable and
 * documented. Keys use snake_case to match the rest of the dataset/export
 * vocabulary.
 */
interface JsonlLineObject {
  clip_id: string;
  clip_index: number;
  clip_title: string | null;
  clip_domain: string;
  rendered_clip_path?: string;
  rendered_clip_storage_key?: string;
  schema_version: number;
  status: string;
  source?: string;
  values: Record<string, unknown>;
}

/** Map one record to its line object, fixing key order for deterministic output. */
function toLineObject(record: ExportRecord): JsonlLineObject {
  const line: JsonlLineObject = {
    clip_id: record.clip.id,
    clip_index: record.clip.index,
    clip_title: record.clip.title,
    clip_domain: record.clip.domain,
    schema_version: record.schemaVersion,
    status: record.status,
    values: record.values ?? {},
  };
  if (record.source !== undefined) {
    line.source = record.source;
  }
  if (record.clip.renderedPath) {
    line.rendered_clip_path = record.clip.renderedPath;
  }
  if (record.clip.renderedStorageKey) {
    line.rendered_clip_storage_key = record.clip.renderedStorageKey;
  }
  return line;
}

/**
 * Serialize one export record to a single JSON line (no newline). Exposed for
 * unit testing and reuse; `serializeJsonl` joins these with `\n`.
 */
export function serializeJsonlLine(record: ExportRecord): string {
  return JSON.stringify(toLineObject(record));
}

/**
 * Serialize an array of export records to JSONL text: one JSON object per line,
 * newline-separated. Empty input yields an empty string (Requirement 6.1).
 */
export function serializeJsonl(records: ReadonlyArray<ExportRecord>): string {
  return records.map(serializeJsonlLine).join("\n");
}
