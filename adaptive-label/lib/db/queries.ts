/**
 * Typed query layer over the pooled Postgres (Aurora) client.
 *
 * Every function uses parameterized SQL (never string interpolation) so queries
 * are injection-safe (design.md → Error Handling: "parameterized queries
 * only"). Returned rows are typed via the interfaces in ./types. JSONB values
 * are explicitly `JSON.stringify`-ed before binding because the `pg` driver
 * would otherwise coerce a plain object to `"[object Object]"`.
 *
 * This is the read/write surface the route handlers and the seed script build
 * on; it intentionally contains no AI, media, or embedding computation
 * (Requirement 8.4) — embeddings are passed in as already-computed vectors.
 */

import type { PoolClient, QueryResultRow } from "pg";

import { getPool, query } from "./client";
import { toVectorLiteral } from "./vector";
import type {
  AnnotationRow,
  AnnotationReviewRow,
  AuditEventRow,
  AudioAnalysisRow,
  ClipRow,
  ClipWithDistanceRow,
  DerivedAssetRow,
  ExportAnnotationRow,
  ExportRow,
  LabelFieldRow,
  LabelSchemaRow,
  LabelingTaskRow,
  MediaAssetRow,
  MediaJobRow,
  ProjectRow,
} from "./types";

/** Bind a value as JSONB, or SQL NULL. */
function jsonParam(value: unknown): string | null {
  return value === undefined || value === null ? null : JSON.stringify(value);
}

/**
 * Build a query runner that targets either a specific transaction client or
 * the pool. Keeps the generic constrained to `QueryResultRow` so typed callers
 * (e.g. inside `withTransaction`) stay type-safe.
 */
function runner(client?: PoolClient) {
  return <T extends QueryResultRow>(text: string, params?: unknown[]) =>
    client ? client.query<T>(text, params) : query<T>(text, params);
}

/**
 * Run `fn` inside a single transaction, committing on success and rolling back
 * on any error. Used for multi-row writes that must be atomic, e.g. activating
 * a schema (insert `label_schemas` + its `label_fields`) so a version is never
 * left half-written (Requirement 1.7).
 */
export async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("begin");
    const result = await fn(client);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

/* -------------------------------------------------------------------------- */
/* projects                                                                   */
/* -------------------------------------------------------------------------- */

export interface NewProject {
  name: string;
  domain: string;
  status?: string;
}

export async function createProject(input: NewProject): Promise<ProjectRow> {
  const { rows } = await query<ProjectRow>(
    `insert into projects (name, domain, status)
     values ($1, $2, coalesce($3, 'active'))
     returning *`,
    [input.name, input.domain, input.status ?? null],
  );
  return rows[0];
}

export async function listProjects(): Promise<ProjectRow[]> {
  const { rows } = await query<ProjectRow>(
    `select * from projects order by created_at asc`,
  );
  return rows;
}

export async function getProjectById(id: string): Promise<ProjectRow | null> {
  const { rows } = await query<ProjectRow>(
    `select * from projects where id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

/* -------------------------------------------------------------------------- */
/* label_schemas                                                              */
/* -------------------------------------------------------------------------- */

export interface NewLabelSchema {
  projectId: string;
  version: number;
  name: string;
  timelineMode: string;
  status?: string;
  generationPrompt?: string | null;
  activatedAt?: Date | null;
}

/** Next immutable version number for a project (1-based). */
export async function getNextSchemaVersion(projectId: string): Promise<number> {
  const { rows } = await query<{ next: number }>(
    `select coalesce(max(version), 0) + 1 as next
       from label_schemas where project_id = $1`,
    [projectId],
  );
  return Number(rows[0]?.next ?? 1);
}

export async function createLabelSchema(
  input: NewLabelSchema,
  client?: PoolClient,
): Promise<LabelSchemaRow> {
  const run = runner(client);
  const { rows } = await run<LabelSchemaRow>(
    `insert into label_schemas
       (project_id, version, name, timeline_mode, status, generation_prompt, activated_at)
     values ($1, $2, $3, $4, coalesce($5, 'active'), $6, $7)
     returning *`,
    [
      input.projectId,
      input.version,
      input.name,
      input.timelineMode,
      input.status ?? null,
      input.generationPrompt ?? null,
      input.activatedAt ?? null,
    ],
  );
  return rows[0];
}

/** The most recently activated `active` schema for a project, if any. */
export async function getActiveSchema(
  projectId: string,
): Promise<LabelSchemaRow | null> {
  const { rows } = await query<LabelSchemaRow>(
    `select * from label_schemas
      where project_id = $1 and status = 'active'
      order by version desc
      limit 1`,
    [projectId],
  );
  return rows[0] ?? null;
}

export async function getSchemaById(
  id: string,
): Promise<LabelSchemaRow | null> {
  const { rows } = await query<LabelSchemaRow>(
    `select * from label_schemas where id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

/**
 * Mark every currently-`active` schema for a project as `retired`, returning
 * the number of rows changed.
 *
 * This is a status-only transition: it never touches a version's
 * `label_fields` rows or any other immutable column, so it does not violate
 * version immutability (Requirement 1.7 / Property 2). It is used during
 * activation so that a freshly-inserted version becomes the single `active`
 * one while prior versions are preserved intact (retired, not deleted).
 */
export async function retireActiveSchemas(
  projectId: string,
  client?: PoolClient,
): Promise<number> {
  const run = runner(client);
  const result = await run<{ id: string }>(
    `update label_schemas
        set status = 'retired'
      where project_id = $1 and status = 'active'
      returning id`,
    [projectId],
  );
  return result.rowCount ?? 0;
}

/* -------------------------------------------------------------------------- */
/* label_fields                                                               */
/* -------------------------------------------------------------------------- */

export interface NewLabelField {
  schemaId: string;
  key: string;
  label: string;
  help?: string | null;
  fieldType: string;
  required?: boolean;
  options?: string[];
  min?: number | null;
  max?: number | null;
  group?: string | null;
  orderIndex?: number;
}

export async function createLabelField(
  input: NewLabelField,
  client?: PoolClient,
): Promise<LabelFieldRow> {
  const run = runner(client);
  const { rows } = await run<LabelFieldRow>(
    `insert into label_fields
       (schema_id, key, label, help, field_type, required, options_json, min, max, field_group, order_index)
     values ($1, $2, $3, $4, $5, coalesce($6, false), coalesce($7::jsonb, '[]'::jsonb), $8, $9, $10, coalesce($11, 0))
     returning *`,
    [
      input.schemaId,
      input.key,
      input.label,
      input.help ?? null,
      input.fieldType,
      input.required ?? null,
      jsonParam(input.options ?? []),
      input.min ?? null,
      input.max ?? null,
      input.group ?? null,
      input.orderIndex ?? null,
    ],
  );
  return rows[0];
}

export async function listFieldsForSchema(
  schemaId: string,
): Promise<LabelFieldRow[]> {
  const { rows } = await query<LabelFieldRow>(
    `select * from label_fields
      where schema_id = $1
      order by order_index asc, key asc`,
    [schemaId],
  );
  return rows;
}

/* -------------------------------------------------------------------------- */
/* media_assets                                                               */
/* -------------------------------------------------------------------------- */

export interface NewMediaAsset {
  projectId: string;
  filename: string;
  storageKey: string;
  status?: string;
  sourceType?: string;
  originalUrl?: string | null;
  localVideoPath?: string | null;
  localAudioPath?: string | null;
  errorMessage?: string | null;
  durationSeconds?: number | null;
  fps?: number | null;
  width?: number | null;
  height?: number | null;
  metadata?: Record<string, unknown>;
}

export async function listMediaAssetsForProject(
  projectId: string,
): Promise<MediaAssetRow[]> {
  const { rows } = await query<MediaAssetRow>(
    `select * from media_assets where project_id = $1 order by filename asc`,
    [projectId],
  );
  return rows;
}

export async function createMediaAsset(
  input: NewMediaAsset,
): Promise<MediaAssetRow> {
  const { rows } = await query<MediaAssetRow>(
    `insert into media_assets
       (project_id, filename, storage_key, status, source_type, original_url,
        local_video_path, local_audio_path, error_message,
        duration_seconds, fps, width, height, metadata_json)
     values ($1, $2, $3, coalesce($4, 'uploaded'), coalesce($5, 'upload'), $6,
        $7, $8, $9, $10, $11, $12, $13, coalesce($14::jsonb, '{}'::jsonb))
     returning *`,
    [
      input.projectId,
      input.filename,
      input.storageKey,
      input.status ?? null,
      input.sourceType ?? null,
      input.originalUrl ?? null,
      input.localVideoPath ?? null,
      input.localAudioPath ?? null,
      input.errorMessage ?? null,
      input.durationSeconds ?? null,
      input.fps ?? null,
      input.width ?? null,
      input.height ?? null,
      jsonParam(input.metadata ?? {}),
    ],
  );
  return rows[0];
}

export async function getMediaAssetById(
  id: string,
): Promise<MediaAssetRow | null> {
  const { rows } = await query<MediaAssetRow>(
    `select * from media_assets where id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

export interface MediaAssetUpdate {
  status?: string;
  localVideoPath?: string | null;
  localAudioPath?: string | null;
  errorMessage?: string | null;
  durationSeconds?: number | null;
  fps?: number | null;
  width?: number | null;
  height?: number | null;
  metadata?: Record<string, unknown>;
}

export async function updateMediaAsset(
  id: string,
  patch: MediaAssetUpdate,
): Promise<MediaAssetRow | null> {
  const { rows } = await query<MediaAssetRow>(
    `update media_assets set
        status = coalesce($2, status),
        local_video_path = case when $3::boolean then $4 else local_video_path end,
        local_audio_path = case when $5::boolean then $6 else local_audio_path end,
        error_message = case when $7::boolean then $8 else error_message end,
        duration_seconds = case when $9::boolean then $10 else duration_seconds end,
        fps = case when $11::boolean then $12 else fps end,
        width = case when $13::boolean then $14 else width end,
        height = case when $15::boolean then $16 else height end,
        metadata_json = case when $17::boolean then $18::jsonb else metadata_json end,
        updated_at = now()
      where id = $1
      returning *`,
    [
      id,
      patch.status ?? null,
      patch.localVideoPath !== undefined,
      patch.localVideoPath ?? null,
      patch.localAudioPath !== undefined,
      patch.localAudioPath ?? null,
      patch.errorMessage !== undefined,
      patch.errorMessage ?? null,
      patch.durationSeconds !== undefined,
      patch.durationSeconds ?? null,
      patch.fps !== undefined,
      patch.fps ?? null,
      patch.width !== undefined,
      patch.width ?? null,
      patch.height !== undefined,
      patch.height ?? null,
      patch.metadata !== undefined,
      patch.metadata !== undefined ? jsonParam(patch.metadata) : null,
    ],
  );
  return rows[0] ?? null;
}

/* -------------------------------------------------------------------------- */
/* audio_analysis / media_jobs / derived_assets                               */
/* -------------------------------------------------------------------------- */

export interface NewAudioAnalysis {
  mediaAssetId: string;
  detectedBpm: number;
  bpmConfidence: number;
  downbeatOffsetSeconds: number;
  beatGrid: number[];
  beatGridFrames: number[];
  energyProfile: number[];
}

export async function upsertAudioAnalysis(
  input: NewAudioAnalysis,
): Promise<AudioAnalysisRow> {
  const { rows } = await query<AudioAnalysisRow>(
    `insert into audio_analysis
       (media_asset_id, detected_bpm, bpm_confidence, downbeat_offset_seconds,
        beat_grid_json, beat_grid_frames_json, energy_profile_json)
     values ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::jsonb)
     on conflict (media_asset_id) do update set
       detected_bpm = excluded.detected_bpm,
       bpm_confidence = excluded.bpm_confidence,
       downbeat_offset_seconds = excluded.downbeat_offset_seconds,
       beat_grid_json = excluded.beat_grid_json,
       beat_grid_frames_json = excluded.beat_grid_frames_json,
       energy_profile_json = excluded.energy_profile_json,
       updated_at = now()
     returning *`,
    [
      input.mediaAssetId,
      input.detectedBpm,
      input.bpmConfidence,
      input.downbeatOffsetSeconds,
      jsonParam(input.beatGrid),
      jsonParam(input.beatGridFrames),
      jsonParam(input.energyProfile),
    ],
  );
  return rows[0];
}

export async function getAudioAnalysisForMedia(
  mediaAssetId: string,
): Promise<AudioAnalysisRow | null> {
  const { rows } = await query<AudioAnalysisRow>(
    `select * from audio_analysis where media_asset_id = $1`,
    [mediaAssetId],
  );
  return rows[0] ?? null;
}

export interface NewMediaJob {
  projectId: string;
  mediaAssetId: string;
  type: string;
  status?: string;
  progress?: number;
}

export async function createMediaJob(input: NewMediaJob): Promise<MediaJobRow> {
  const { rows } = await query<MediaJobRow>(
    `insert into media_jobs (project_id, media_asset_id, type, status, progress)
     values ($1, $2, $3, coalesce($4, 'queued'), coalesce($5, 0))
     returning *`,
    [
      input.projectId,
      input.mediaAssetId,
      input.type,
      input.status ?? null,
      input.progress ?? null,
    ],
  );
  return rows[0];
}

export interface MediaJobUpdate {
  status?: string;
  progress?: number;
  errorMessage?: string | null;
  startedAt?: Date | null;
  completedAt?: Date | null;
}

export async function updateMediaJob(
  id: string,
  patch: MediaJobUpdate,
): Promise<MediaJobRow | null> {
  const { rows } = await query<MediaJobRow>(
    `update media_jobs set
        status = coalesce($2, status),
        progress = coalesce($3, progress),
        error_message = case when $4::boolean then $5 else error_message end,
        started_at = case when $6::boolean then $7 else started_at end,
        completed_at = case when $8::boolean then $9 else completed_at end,
        updated_at = now()
      where id = $1
      returning *`,
    [
      id,
      patch.status ?? null,
      patch.progress ?? null,
      patch.errorMessage !== undefined,
      patch.errorMessage ?? null,
      patch.startedAt !== undefined,
      patch.startedAt ?? null,
      patch.completedAt !== undefined,
      patch.completedAt ?? null,
    ],
  );
  return rows[0] ?? null;
}

export async function listMediaJobsForAsset(
  mediaAssetId: string,
): Promise<MediaJobRow[]> {
  const { rows } = await query<MediaJobRow>(
    `select * from media_jobs
      where media_asset_id = $1
      order by created_at desc`,
    [mediaAssetId],
  );
  return rows;
}

export interface NewDerivedAsset {
  projectId: string;
  mediaAssetId?: string | null;
  clipId?: string | null;
  assetType: string;
  storageKey?: string | null;
  localPath?: string | null;
  metadata?: Record<string, unknown>;
}

export async function createDerivedAsset(
  input: NewDerivedAsset,
): Promise<DerivedAssetRow> {
  const { rows } = await query<DerivedAssetRow>(
    `insert into derived_assets
       (project_id, media_asset_id, clip_id, asset_type, storage_key, local_path, metadata_json)
     values ($1, $2, $3, $4, $5, $6, coalesce($7::jsonb, '{}'::jsonb))
     returning *`,
    [
      input.projectId,
      input.mediaAssetId ?? null,
      input.clipId ?? null,
      input.assetType,
      input.storageKey ?? null,
      input.localPath ?? null,
      jsonParam(input.metadata ?? {}),
    ],
  );
  return rows[0];
}

export async function getLatestDerivedAssetForClip(
  clipId: string,
  assetType: string,
): Promise<DerivedAssetRow | null> {
  const { rows } = await query<DerivedAssetRow>(
    `select * from derived_assets
      where clip_id = $1 and asset_type = $2
      order by created_at desc
      limit 1`,
    [clipId, assetType],
  );
  return rows[0] ?? null;
}

/* -------------------------------------------------------------------------- */
/* clips                                                                      */
/* -------------------------------------------------------------------------- */

export interface NewClip {
  projectId: string;
  mediaAssetId?: string | null;
  clipIndex: number;
  title?: string | null;
  domain: string;
  startFrame?: number | null;
  endFrame?: number | null;
  startSeconds?: number | null;
  endSeconds?: number | null;
  metadata?: Record<string, unknown>;
  searchText?: string | null;
  /** Pre-computed embedding (offline only). `null`/omitted leaves it unset. */
  embedding?: ReadonlyArray<number> | null;
}

export async function createClip(input: NewClip): Promise<ClipRow> {
  const embeddingLiteral =
    input.embedding && input.embedding.length > 0
      ? toVectorLiteral(input.embedding)
      : null;
  const { rows } = await query<ClipRow>(
    `insert into clips
       (project_id, media_asset_id, clip_index, title, domain,
        start_frame, end_frame, start_seconds, end_seconds,
        metadata_json, search_text, embedding)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9,
        coalesce($10::jsonb, '{}'::jsonb), $11, $12::vector)
     returning *`,
    [
      input.projectId,
      input.mediaAssetId ?? null,
      input.clipIndex,
      input.title ?? null,
      input.domain,
      input.startFrame ?? null,
      input.endFrame ?? null,
      input.startSeconds ?? null,
      input.endSeconds ?? null,
      jsonParam(input.metadata ?? {}),
      input.searchText ?? null,
      embeddingLiteral,
    ],
  );
  return rows[0];
}

export async function listClipsForProject(
  projectId: string,
): Promise<ClipRow[]> {
  const { rows } = await query<ClipRow>(
    `select * from clips where project_id = $1 order by clip_index asc`,
    [projectId],
  );
  return rows;
}

export async function listClipsForMediaAsset(
  mediaAssetId: string,
): Promise<ClipRow[]> {
  const { rows } = await query<ClipRow>(
    `select * from clips where media_asset_id = $1 order by clip_index asc`,
    [mediaAssetId],
  );
  return rows;
}

export async function getClipById(id: string): Promise<ClipRow | null> {
  const { rows } = await query<ClipRow>(`select * from clips where id = $1`, [
    id,
  ]);
  return rows[0] ?? null;
}

/**
 * Remove generated clips for a media asset before regenerating them. This is
 * intentionally destructive for that media asset: annotations, tasks, derived
 * assets, and clips tied to the previous generated clip set are deleted.
 */
export async function deleteClipsForMediaAsset(
  mediaAssetId: string,
): Promise<number> {
  return withTransaction(async (client) => {
    const run = runner(client);
    const clipRows = await run<{ id: string }>(
      `select id from clips where media_asset_id = $1`,
      [mediaAssetId],
    );
    const clipIds = clipRows.rows.map((row) => row.id);
    if (clipIds.length === 0) return 0;

    await run(
      `delete from annotations
        where task_id in (
          select id from labeling_tasks where clip_id = any($1::uuid[])
        )`,
      [clipIds],
    );
    await run(`delete from labeling_tasks where clip_id = any($1::uuid[])`, [
      clipIds,
    ]);
    await run(`delete from derived_assets where clip_id = any($1::uuid[])`, [
      clipIds,
    ]);
    const deleted = await run<{ id: string }>(
      `delete from clips where id = any($1::uuid[]) returning id`,
      [clipIds],
    );
    return deleted.rowCount ?? 0;
  });
}

export interface SimilarClipsOptions {
  /** Max neighbors to return. */
  limit?: number;
  /** When false (default), restrict to the source clip's own domain. */
  crossDomain?: boolean;
}

/**
 * Nearest clips to `clipId` by cosine distance, using the clip's *stored*
 * embedding — no embedding is computed here (Requirement 5.5). The source clip
 * is excluded from its own results, and clips without an embedding are skipped.
 * Results are ordered by non-decreasing distance (Requirement 5.3/5.4).
 */
export async function findSimilarClips(
  clipId: string,
  options: SimilarClipsOptions = {},
): Promise<ClipWithDistanceRow[]> {
  const limit = options.limit ?? 10;
  const crossDomain = options.crossDomain ?? false;
  const { rows } = await query<ClipWithDistanceRow>(
    `with src as (
        select embedding, domain from clips where id = $1
     )
     select c.*, (c.embedding <=> src.embedding) as distance
       from clips c, src
      where c.id <> $1
        and c.embedding is not null
        and src.embedding is not null
        and ($3::boolean = true or c.domain = src.domain)
      order by c.embedding <=> src.embedding
      limit $2`,
    [clipId, limit, crossDomain],
  );
  return rows;
}

/* -------------------------------------------------------------------------- */
/* labeling_tasks                                                             */
/* -------------------------------------------------------------------------- */

export interface NewLabelingTask {
  projectId: string;
  clipId: string;
  schemaId: string;
  status?: string;
}

export async function createLabelingTask(
  input: NewLabelingTask,
): Promise<LabelingTaskRow> {
  const { rows } = await query<LabelingTaskRow>(
    `insert into labeling_tasks (project_id, clip_id, schema_id, status)
     values ($1, $2, $3, coalesce($4, 'queued'))
     returning *`,
    [input.projectId, input.clipId, input.schemaId, input.status ?? null],
  );
  return rows[0];
}

export async function listTasksForProject(
  projectId: string,
): Promise<LabelingTaskRow[]> {
  const { rows } = await query<LabelingTaskRow>(
    `select * from labeling_tasks where project_id = $1 order by created_at asc`,
    [projectId],
  );
  return rows;
}

export async function getTaskById(
  id: string,
): Promise<LabelingTaskRow | null> {
  const { rows } = await query<LabelingTaskRow>(
    `select * from labeling_tasks where id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

/* -------------------------------------------------------------------------- */
/* annotations                                                                */
/* -------------------------------------------------------------------------- */

export interface NewAnnotation {
  taskId: string;
  schemaId: string;
  source?: string;
  status?: string;
  values?: Record<string, unknown>;
  confidence?: Record<string, unknown> | null;
  validation?: unknown;
}

export async function createAnnotation(
  input: NewAnnotation,
): Promise<AnnotationRow> {
  const { rows } = await query<AnnotationRow>(
    `insert into annotations
       (task_id, schema_id, source, status, values_json, confidence_json, validation_json)
     values ($1, $2, coalesce($3, 'human'), coalesce($4, 'submitted'),
        coalesce($5::jsonb, '{}'::jsonb), $6::jsonb, $7::jsonb)
     returning *`,
    [
      input.taskId,
      input.schemaId,
      input.source ?? null,
      input.status ?? null,
      jsonParam(input.values ?? {}),
      jsonParam(input.confidence ?? null),
      jsonParam(input.validation ?? null),
    ],
  );
  return rows[0];
}

export interface AnnotationUpdate {
  status?: string;
  values?: Record<string, unknown>;
  confidence?: Record<string, unknown> | null;
  validation?: unknown | null;
}

/**
 * Patch an existing annotation. Only provided fields change; `updated_at` is
 * always bumped. Returns the updated row, or null if no such annotation.
 */
export async function updateAnnotation(
  id: string,
  patch: AnnotationUpdate,
): Promise<AnnotationRow | null> {
  const { rows } = await query<AnnotationRow>(
    `update annotations set
        status = coalesce($2, status),
        values_json = case when $3::boolean then $4::jsonb else values_json end,
        confidence_json = case when $5::boolean then $6::jsonb else confidence_json end,
        validation_json = case when $7::boolean then $8::jsonb else validation_json end,
        updated_at = now()
      where id = $1
      returning *`,
    [
      id,
      patch.status ?? null,
      patch.values !== undefined,
      patch.values !== undefined ? jsonParam(patch.values) : null,
      patch.confidence !== undefined,
      patch.confidence !== undefined ? jsonParam(patch.confidence) : null,
      patch.validation !== undefined,
      patch.validation !== undefined ? jsonParam(patch.validation) : null,
    ],
  );
  return rows[0] ?? null;
}

export async function listAnnotationsForTask(
  taskId: string,
): Promise<AnnotationRow[]> {
  const { rows } = await query<AnnotationRow>(
    `select * from annotations where task_id = $1 order by created_at asc`,
    [taskId],
  );
  return rows;
}

/**
 * All annotations belonging to a project (joined through their task), newest
 * first. Used by the export pipeline (Requirement 6) which filters in SQL.
 */
export async function listAnnotationsForProject(
  projectId: string,
  filter: { status?: string } = {},
): Promise<AnnotationRow[]> {
  const { rows } = await query<AnnotationRow>(
    `select a.* from annotations a
       join labeling_tasks t on t.id = a.task_id
      where t.project_id = $1
        and ($2::text is null or a.status = $2)
      order by a.created_at desc`,
    [projectId, filter.status ?? null],
  );
  return rows;
}

/**
 * Flattened export rows for a project: each annotation joined to its clip (via
 * the labeling task) and its schema version, newest first, optionally filtered
 * by annotation status (Requirements 6.1, 6.2).
 *
 * The joins to `clips` and `label_schemas` are INNER joins, so a row is only
 * returned when the referenced clip and schema version both exist — which is
 * exactly the "references an existing clip and a valid schema version" half of
 * Property 7 (design.md → Export fidelity). The optional `status` filter is
 * applied in SQL so the returned row count equals the number of annotations
 * matching the export filter (the count half of Property 7).
 */
export async function listAnnotationsForExport(
  projectId: string,
  filter: { status?: string } = {},
): Promise<ExportAnnotationRow[]> {
  const { rows } = await query<ExportAnnotationRow>(
    `select
        a.id          as annotation_id,
        a.status      as status,
        a.source      as source,
        a.values_json as values_json,
        a.created_at  as created_at,
        c.id          as clip_id,
        c.clip_index  as clip_index,
        c.title       as clip_title,
        c.domain      as clip_domain,
        s.id          as schema_id,
        s.version     as schema_version,
        da.local_path as rendered_clip_path,
        da.storage_key as rendered_clip_storage_key
       from annotations a
       join labeling_tasks t on t.id = a.task_id
       join clips c on c.id = t.clip_id
       join label_schemas s on s.id = a.schema_id
       left join lateral (
         select local_path, storage_key
           from derived_assets
          where clip_id = c.id and asset_type = 'rendered_clip_mp4'
          order by created_at desc
          limit 1
       ) da on true
      where t.project_id = $1
        and ($2::text is null or a.status = $2)
      order by a.created_at desc`,
    [projectId, filter.status ?? null],
  );
  return rows;
}

/* -------------------------------------------------------------------------- */
/* annotation_reviews (Tier 2)                                                */
/* -------------------------------------------------------------------------- */

export interface NewAnnotationReview {
  annotationId: string;
  decision: string;
  notes?: string | null;
}

export async function createAnnotationReview(
  input: NewAnnotationReview,
): Promise<AnnotationReviewRow> {
  const { rows } = await query<AnnotationReviewRow>(
    `insert into annotation_reviews (annotation_id, decision, notes)
     values ($1, $2, $3)
     returning *`,
    [input.annotationId, input.decision, input.notes ?? null],
  );
  return rows[0];
}

/* -------------------------------------------------------------------------- */
/* audit_events (Tier 2)                                                      */
/* -------------------------------------------------------------------------- */

export interface NewAuditEvent {
  projectId?: string | null;
  actor?: string | null;
  eventType: string;
  entityType?: string | null;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
}

export async function createAuditEvent(
  input: NewAuditEvent,
): Promise<AuditEventRow> {
  const { rows } = await query<AuditEventRow>(
    `insert into audit_events
       (project_id, actor, event_type, entity_type, entity_id, before_json, after_json)
     values ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb)
     returning *`,
    [
      input.projectId ?? null,
      input.actor ?? null,
      input.eventType,
      input.entityType ?? null,
      input.entityId ?? null,
      jsonParam(input.before ?? null),
      jsonParam(input.after ?? null),
    ],
  );
  return rows[0];
}

/* -------------------------------------------------------------------------- */
/* exports                                                                    */
/* -------------------------------------------------------------------------- */

export interface NewExport {
  projectId: string;
  format: string;
  status?: string;
  storageKey?: string | null;
  filters?: Record<string, unknown>;
  completedAt?: Date | null;
}

export async function createExport(input: NewExport): Promise<ExportRow> {
  const { rows } = await query<ExportRow>(
    `insert into exports
       (project_id, format, status, storage_key, filters_json, completed_at)
     values ($1, $2, coalesce($3, 'succeeded'), $4, coalesce($5::jsonb, '{}'::jsonb), $6)
     returning *`,
    [
      input.projectId,
      input.format,
      input.status ?? null,
      input.storageKey ?? null,
      jsonParam(input.filters ?? {}),
      input.completedAt ?? null,
    ],
  );
  return rows[0];
}
