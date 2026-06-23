// Shared required-field list — single source of truth for the annotation
// domain. Imported by `annotation-service.ts` (completeness scoring) and
// `schema-validator.ts` (presence/validation). The field set and ordering
// must be preserved exactly; `TOTAL_REQUIRED_FIELDS` derives from `.length`.

/** The 10 required annotation fields, as dot-paths. */
export const REQUIRED_FIELDS: string[] = [
  'clip_id',
  'source_id',
  'status',
  'remotion.from_frame',
  'remotion.duration_in_frames',
  'remotion.fps',
  'move_name',
  'difficulty',
  'style',
  'tags',
];
