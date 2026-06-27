/**
 * Typed row shapes for every table in the AdaptiveLabel data model
 * (design.md → "Data Models").
 *
 * These mirror what the `pg` driver actually returns, not just the SQL types:
 * - `uuid`, `text`           → string
 * - `integer`                → number
 * - `numeric`                → string   (pg returns numeric as a string to
 *                                         preserve precision; callers parse if
 *                                         they need a number)
 * - `boolean`                → boolean
 * - `timestamptz`            → Date
 * - `jsonb`                  → parsed value (typed below)
 * - `vector(1536)`           → string   (pgvector text literal `[..]`; use
 *                                         `parseVector` from ./vector)
 *
 * Nullable columns are typed `| null`.
 */

/** Workflow / status string unions used across tables. */
export type SchemaStatus = "draft" | "active" | "retired";
export type AnnotationSource = "human" | "ai_draft";
export type AnnotationStatus = "draft" | "submitted" | "approved" | "rejected";
export type ReviewDecision = "approved" | "changes_requested" | "rejected";
export type ExportFormat = "jsonl" | "csv" | "project_json";

/** `projects` */
export interface ProjectRow {
  id: string;
  name: string;
  domain: string;
  status: string;
  created_at: Date;
}

/** `label_schemas` */
export interface LabelSchemaRow {
  id: string;
  project_id: string;
  version: number;
  name: string;
  timeline_mode: string;
  status: string;
  generation_prompt: string | null;
  created_at: Date;
  activated_at: Date | null;
}

/** `label_fields` */
export interface LabelFieldRow {
  id: string;
  schema_id: string;
  key: string;
  label: string;
  help: string | null;
  field_type: string;
  required: boolean;
  options_json: string[];
  min: string | null;
  max: string | null;
  field_group: string | null;
  order_index: number;
}

/** `media_assets` */
export interface MediaAssetRow {
  id: string;
  project_id: string;
  filename: string;
  storage_key: string;
  duration_seconds: string | null;
  fps: string | null;
  width: number | null;
  height: number | null;
  metadata_json: Record<string, unknown>;
  status: string;
  source_type: string;
  original_url: string | null;
  local_video_path: string | null;
  local_audio_path: string | null;
  error_message: string | null;
  updated_at: Date;
}

/** `clips` */
export interface ClipRow {
  id: string;
  project_id: string;
  media_asset_id: string | null;
  clip_index: number;
  title: string | null;
  domain: string;
  start_frame: number | null;
  end_frame: number | null;
  start_seconds: string | null;
  end_seconds: string | null;
  metadata_json: Record<string, unknown>;
  search_text: string | null;
  /** pgvector text literal, or null when the clip has no embedding. */
  embedding: string | null;
}

/** `labeling_tasks` */
export interface LabelingTaskRow {
  id: string;
  project_id: string;
  clip_id: string;
  schema_id: string;
  status: string;
  created_at: Date;
}

/** `annotations` */
export interface AnnotationRow {
  id: string;
  task_id: string;
  schema_id: string;
  source: string;
  status: string;
  values_json: Record<string, unknown>;
  confidence_json: Record<string, unknown> | null;
  validation_json: unknown;
  created_at: Date;
  updated_at: Date;
}

/** `annotation_reviews` */
export interface AnnotationReviewRow {
  id: string;
  annotation_id: string;
  decision: string;
  notes: string | null;
  created_at: Date;
}

/** `audit_events` */
export interface AuditEventRow {
  id: string;
  project_id: string | null;
  actor: string | null;
  event_type: string;
  entity_type: string | null;
  entity_id: string | null;
  before_json: unknown;
  after_json: unknown;
  created_at: Date;
}

/** `exports` */
export interface ExportRow {
  id: string;
  project_id: string;
  format: string;
  status: string;
  storage_key: string | null;
  filters_json: Record<string, unknown>;
  created_at: Date;
  completed_at: Date | null;
}

/** `audio_analysis` */
export interface AudioAnalysisRow {
  id: string;
  media_asset_id: string;
  detected_bpm: string;
  bpm_confidence: string;
  downbeat_offset_seconds: string;
  beat_grid_json: number[];
  beat_grid_frames_json: number[];
  energy_profile_json: number[];
  created_at: Date;
  updated_at: Date;
}

/** `media_jobs` */
export interface MediaJobRow {
  id: string;
  project_id: string;
  media_asset_id: string;
  type: string;
  status: string;
  progress: string;
  error_message: string | null;
  created_at: Date;
  started_at: Date | null;
  completed_at: Date | null;
  updated_at: Date;
}

/** `derived_assets` */
export interface DerivedAssetRow {
  id: string;
  project_id: string;
  media_asset_id: string | null;
  clip_id: string | null;
  asset_type: string;
  storage_key: string | null;
  local_path: string | null;
  metadata_json: Record<string, unknown>;
  created_at: Date;
}

/** A clip row plus the cosine distance to a query vector (similarity search). */
export interface ClipWithDistanceRow extends ClipRow {
  /** Cosine distance (`<=>`); smaller is more similar. */
  distance: number;
}

/**
 * A flattened export row: one annotation joined to its clip (via the labeling
 * task) and its schema version. Produced by `listAnnotationsForExport` and
 * consumed by the JSONL export serializer (Requirement 6.2). Because the join
 * is inner, every row is guaranteed to reference an existing clip and a valid
 * schema version (design.md → Property 7).
 */
export interface ExportAnnotationRow {
  /** `annotations.id`. */
  annotation_id: string;
  /** `annotations.status`. */
  status: string;
  /** `annotations.source` (`human` | `ai_draft`). */
  source: string;
  /** `annotations.values_json` keyed by schema field `key`. */
  values_json: Record<string, unknown>;
  /** `annotations.created_at`. */
  created_at: Date;
  /** `clips.id` — the clip reference. */
  clip_id: string;
  /** `clips.clip_index`. */
  clip_index: number;
  /** `clips.title`. */
  clip_title: string | null;
  /** `clips.domain`. */
  clip_domain: string;
  /** `label_schemas.id`. */
  schema_id: string;
  /** `label_schemas.version` — the immutable schema version. */
  schema_version: number;
  /** Latest rendered MP4 path, if this clip has been rendered. */
  rendered_clip_path?: string | null;
  /** Latest rendered MP4 storage key, if this clip has been rendered. */
  rendered_clip_storage_key?: string | null;
}
