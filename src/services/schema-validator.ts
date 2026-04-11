// Schema Validator — implements all validation rules from Requirement 14.
// Pure functions; no side effects.

import type { ClipAnnotation, ValidationError } from '../types/index.js';
import type { EnumDefinitions } from '../types/enums.js';
import { DEFAULT_ENUM_DEFINITIONS, CLIP_STATUS_VALUES } from '../types/enums.js';

// ---------------------------------------------------------------------------
// Required fields (Requirement 14.1) — 23 dot-paths
// ---------------------------------------------------------------------------

const REQUIRED_FIELDS: string[] = [
  'clip_id',
  'source_id',
  'status',
  'remotion.from_frame',
  'remotion.duration_in_frames',
  'remotion.fps',
  'move_name',
  'move_label',
  'difficulty',
  'energy_level',
  'style',
  'estimated_tempo_bpm',
  'duration_seconds',
  'beats_total',
  'bars_total',
  'entry_state.hold',
  'entry_state.leader_weight_foot',
  'entry_state.follower_weight_foot',
  'exit_state.hold',
  'exit_state.leader_weight_foot',
  'exit_state.follower_weight_foot',
  'trim_profile.trim_safe_start_seconds',
  'trim_profile.trim_safe_end_seconds',
];

// ---------------------------------------------------------------------------
// Enum field → EnumDefinitions key mapping (Requirement 14.2)
// ---------------------------------------------------------------------------

const ENUM_FIELD_MAP: Record<string, keyof EnumDefinitions> = {
  move_label: 'move_label',
  difficulty: 'difficulty',
  energy_level: 'energy_level',
  style: 'style',
  phrase_resolution: 'phrase_resolution',
  'completion_profile.tempo_feel': 'tempo_feel',
  'completion_profile.accent_pattern': 'accent_pattern',
  'entry_state.hold': 'hold',
  'entry_state.leader_weight_foot': 'weight_foot',
  'entry_state.follower_weight_foot': 'weight_foot',
  'entry_state.leader_facing': 'facing',
  'entry_state.follower_facing': 'facing',
  'entry_state.relative_position': 'relative_position',
  'entry_state.travel_direction': 'travel_direction',
  'entry_state.rotation_direction': 'rotation_direction',
  'entry_state.distance_profile': 'distance_profile',
  'entry_state.frame_tension': 'frame_tension',
  'exit_state.hold': 'hold',
  'exit_state.leader_weight_foot': 'weight_foot',
  'exit_state.follower_weight_foot': 'weight_foot',
  'exit_state.leader_facing': 'facing',
  'exit_state.follower_facing': 'facing',
  'exit_state.relative_position': 'relative_position',
  'exit_state.travel_direction': 'travel_direction',
  'exit_state.rotation_direction': 'rotation_direction',
  'exit_state.distance_profile': 'distance_profile',
  'exit_state.frame_tension': 'frame_tension',
  'motion_profile.travel_amount': 'travel_amount',
  'motion_profile.footwork_complexity': 'footwork_complexity',
  'motion_profile.upper_body_isolation': 'upper_body_isolation',
  'motion_profile.leader_dominant_motion': 'dominant_motion',
  'motion_profile.follower_dominant_motion': 'dominant_motion',
  'camera_profile.camera_angle': 'camera_angle',
  'camera_profile.framing': 'framing',
};

// ---------------------------------------------------------------------------
// Float score fields (Requirement 14.8)
// ---------------------------------------------------------------------------

const FLOAT_SCORE_PATHS: string[] = [
  'camera_profile.visibility_score',
  'quality_profile.visibility_score',
  'quality_profile.boundary_cleanliness',
  'quality_profile.teaching_clarity',
  'quality_profile.stitchability',
  'completion_profile.syncopation_level',
  'camera_profile.occlusion_score',
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Resolve a dot-path on any object. */
function getNestedValue(obj: unknown, dotPath: string): unknown {
  const keys = dotPath.split('.');
  let current: unknown = obj;
  for (const key of keys) {
    if (current == null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

function isEmptyValue(v: unknown): boolean {
  if (v === undefined || v === null) return true;
  if (typeof v === 'string' && v.trim() === '') return true;
  return false;
}

function isInteger(v: unknown): boolean {
  return typeof v === 'number' && Number.isInteger(v);
}

function err(field: string, rule: string, message: string): ValidationError {
  return { field, rule, message };
}

// ---------------------------------------------------------------------------
// validateClip — runs ALL rules, collects every error (Requirement 14.16)
// ---------------------------------------------------------------------------

export function validateClip(
  clip: ClipAnnotation,
  allClipIds: Set<string>,
  sourceTotalFrames: number,
  enumDefs: EnumDefinitions = DEFAULT_ENUM_DEFINITIONS,
): ValidationError[] {
  const errors: ValidationError[] = [];
  const obj = clip as unknown as Record<string, unknown>;

  // 14.1 — Required fields
  for (const field of REQUIRED_FIELDS) {
    const val = getNestedValue(obj, field);
    if (isEmptyValue(val)) {
      errors.push(err(field, 'required', `Required field "${field}" is missing or empty`));
    }
  }

  // 14.2 — Enum validation (skip if value is undefined — optional fields)
  // Special-case: status uses CLIP_STATUS_VALUES, not in EnumDefinitions
  if (clip.status !== undefined && clip.status !== null) {
    if (!(CLIP_STATUS_VALUES as readonly string[]).includes(clip.status as string)) {
      errors.push(err('status', 'enum', `Invalid status value "${clip.status}"`));
    }
  }
  for (const [fieldPath, enumKey] of Object.entries(ENUM_FIELD_MAP)) {
    const val = getNestedValue(obj, fieldPath);
    if (val === undefined || val === null) continue; // optional field not set
    const allowed = enumDefs[enumKey];
    if (!allowed.includes(val as string)) {
      errors.push(err(fieldPath, 'enum', `"${val}" is not a valid value for "${fieldPath}"`));
    }
  }

  // 14.3 — Trim range ordering
  const trimStart = clip.trim_profile?.trim_safe_start_seconds;
  const trimEnd = clip.trim_profile?.trim_safe_end_seconds;
  if (trimStart !== undefined && trimEnd !== undefined && trimStart >= trimEnd) {
    errors.push(
      err(
        'trim_profile.trim_safe_start_seconds',
        'trim_range_order',
        'trim_safe_start_seconds must be less than trim_safe_end_seconds',
      ),
    );
  }

  // 14.4 — Trim end ≤ duration
  if (trimEnd !== undefined && clip.duration_seconds !== undefined && trimEnd > clip.duration_seconds) {
    errors.push(
      err(
        'trim_profile.trim_safe_end_seconds',
        'trim_end_duration',
        'trim_safe_end_seconds must not exceed duration_seconds',
      ),
    );
  }

  // 14.5 — Beats/bars consistency
  if (clip.beats_total !== undefined && clip.bars_total !== undefined) {
    if (!isInteger(clip.beats_total) || clip.beats_total <= 0) {
      errors.push(err('beats_total', 'beats_bars', 'beats_total must be a positive integer'));
    }
    if (!isInteger(clip.bars_total) || clip.bars_total <= 0) {
      errors.push(err('bars_total', 'beats_bars', 'bars_total must be a positive integer'));
    }
    if (
      isInteger(clip.beats_total) &&
      clip.beats_total > 0 &&
      isInteger(clip.bars_total) &&
      clip.bars_total > 0 &&
      clip.bars_total !== clip.beats_total / 4
    ) {
      errors.push(
        err('bars_total', 'beats_bars', 'bars_total must equal beats_total / 4'),
      );
    }
  }

  // 14.6 — Rotation consistency (check both entry_state and exit_state)
  for (const stateKey of ['entry_state', 'exit_state'] as const) {
    const state = clip[stateKey];
    if (state?.rotation_direction === 'none' && state.rotation_degrees !== undefined && state.rotation_degrees !== 0) {
      errors.push(
        err(
          `${stateKey}.rotation_degrees`,
          'rotation_consistency',
          `rotation_degrees must be 0 when rotation_direction is "none"`,
        ),
      );
    }
  }

  // 14.7 — Travel consistency (check both entry_state and exit_state)
  for (const stateKey of ['entry_state', 'exit_state'] as const) {
    const state = clip[stateKey];
    const travelAmount = clip.motion_profile?.travel_amount;
    if (
      state?.travel_direction === 'stationary' &&
      travelAmount !== undefined &&
      travelAmount !== 'none' &&
      travelAmount !== 'low'
    ) {
      errors.push(
        err(
          'motion_profile.travel_amount',
          'travel_consistency',
          `travel_amount must be "none" or "low" when travel_direction is "stationary"`,
        ),
      );
    }
  }

  // 14.8 — Float scores in [0.0, 1.0]
  for (const scorePath of FLOAT_SCORE_PATHS) {
    const val = getNestedValue(obj, scorePath);
    if (val === undefined || val === null) continue;
    if (typeof val !== 'number' || val < 0.0 || val > 1.0) {
      errors.push(
        err(scorePath, 'float_range', `${scorePath} must be a number in [0.0, 1.0]`),
      );
    }
  }

  // 14.9 — Body orientation range (check both states)
  for (const stateKey of ['entry_state', 'exit_state'] as const) {
    const state = clip[stateKey];
    if (state?.body_orientation_degrees !== undefined) {
      const deg = state.body_orientation_degrees;
      if (typeof deg !== 'number' || deg < 0 || deg > 360) {
        errors.push(
          err(
            `${stateKey}.body_orientation_degrees`,
            'body_orientation_range',
            'body_orientation_degrees must be in [0, 360]',
          ),
        );
      }
    }
  }

  // 14.10 — Spin count non-negative integer
  if (clip.motion_profile?.spin_count !== undefined) {
    const sc = clip.motion_profile.spin_count;
    if (!isInteger(sc) || sc < 0) {
      errors.push(
        err('motion_profile.spin_count', 'spin_count', 'spin_count must be a non-negative integer'),
      );
    }
  }

  // 14.11 — Hand connections vocabulary (check both states)
  for (const stateKey of ['entry_state', 'exit_state'] as const) {
    const state = clip[stateKey];
    if (state?.hand_connections && Array.isArray(state.hand_connections)) {
      const allowed = enumDefs.hand_connections;
      for (const hc of state.hand_connections) {
        if (!allowed.includes(hc as string)) {
          errors.push(
            err(
              `${stateKey}.hand_connections`,
              'hand_connections_vocab',
              `"${hc}" is not a valid hand_connections value`,
            ),
          );
        }
      }
    }
  }

  // 14.12 — Clip ID uniqueness
  if (clip.clip_id && allClipIds.has(clip.clip_id)) {
    errors.push(
      err('clip_id', 'unique_clip_id', `clip_id "${clip.clip_id}" is not unique`),
    );
  }

  // 14.13 — Frame constraints
  if (clip.remotion) {
    if (!isInteger(clip.remotion.from_frame) || clip.remotion.from_frame < 0) {
      errors.push(
        err('remotion.from_frame', 'frame_constraints', 'from_frame must be a non-negative integer'),
      );
    }
    if (!isInteger(clip.remotion.duration_in_frames) || clip.remotion.duration_in_frames <= 0) {
      errors.push(
        err(
          'remotion.duration_in_frames',
          'frame_constraints',
          'duration_in_frames must be a positive integer',
        ),
      );
    }
  }

  // 14.14 — Frame range
  if (
    clip.remotion &&
    isInteger(clip.remotion.from_frame) &&
    isInteger(clip.remotion.duration_in_frames) &&
    clip.remotion.from_frame + clip.remotion.duration_in_frames > sourceTotalFrames
  ) {
    errors.push(
      err(
        'remotion.from_frame',
        'frame_range',
        'from_frame + duration_in_frames exceeds sourceTotalFrames',
      ),
    );
  }

  // 14.15 — Duration consistency
  if (
    clip.remotion &&
    clip.duration_seconds !== undefined &&
    clip.remotion.fps > 0 &&
    clip.remotion.duration_in_frames > 0
  ) {
    const expected = clip.remotion.duration_in_frames / clip.remotion.fps;
    if (Math.abs(clip.duration_seconds - expected) > 0.001) {
      errors.push(
        err(
          'duration_seconds',
          'duration_consistency',
          `duration_seconds must equal duration_in_frames / fps within 0.001s tolerance`,
        ),
      );
    }
  }

  return errors;
}

// ---------------------------------------------------------------------------
// validateField — validate a single field value (Requirement 14.2 / 14.16)
// ---------------------------------------------------------------------------

export function validateField(
  fieldPath: string,
  value: unknown,
  enumDefs: EnumDefinitions = DEFAULT_ENUM_DEFINITIONS,
): ValidationError | null {
  // Check if this field is an enum field
  if (fieldPath === 'status') {
    if (value !== undefined && value !== null) {
      if (!(CLIP_STATUS_VALUES as readonly string[]).includes(value as string)) {
        return err('status', 'enum', `Invalid status value "${value}"`);
      }
    }
    return null;
  }

  const enumKey = ENUM_FIELD_MAP[fieldPath];
  if (enumKey) {
    if (value === undefined || value === null) return null;
    const allowed = enumDefs[enumKey];
    if (!allowed.includes(value as string)) {
      return err(fieldPath, 'enum', `"${value}" is not a valid value for "${fieldPath}"`);
    }
    return null;
  }

  // Float score check
  if (FLOAT_SCORE_PATHS.includes(fieldPath)) {
    if (value === undefined || value === null) return null;
    if (typeof value !== 'number' || value < 0.0 || value > 1.0) {
      return err(fieldPath, 'float_range', `${fieldPath} must be a number in [0.0, 1.0]`);
    }
    return null;
  }

  // Required field check
  if (REQUIRED_FIELDS.includes(fieldPath) && isEmptyValue(value)) {
    return err(fieldPath, 'required', `Required field "${fieldPath}" is missing or empty`);
  }

  return null;
}
