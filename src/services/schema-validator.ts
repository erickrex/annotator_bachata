// Schema Validator — validates only the reduced required field set.
// Pure functions; no side effects.
// Validation errors reference ONLY the required fields:
//   clip_id, source_id, status, remotion.from_frame, remotion.duration_in_frames,
//   remotion.fps, move_name, difficulty, style, tags
// Unknown/optional fields are silently preserved (no validation errors for them).

import type { ClipAnnotation, ValidationError } from '../types/index.js';
import type { EnumDefinitions } from '../types/enums.js';
import { DEFAULT_ENUM_DEFINITIONS, CLIP_STATUS_VALUES } from '../types/enums.js';

// ---------------------------------------------------------------------------
// Required fields — 10 dot-paths (reduced set per Requirements 4.1, 4.2, 4.3)
// ---------------------------------------------------------------------------

const REQUIRED_FIELDS: string[] = [
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

// ---------------------------------------------------------------------------
// Enum field → EnumDefinitions key mapping (only for required fields)
// ---------------------------------------------------------------------------

const ENUM_FIELD_MAP: Record<string, keyof EnumDefinitions> = {
  difficulty: 'difficulty',
  style: 'style',
};

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
// validateClip — validates only the reduced required field set
// ---------------------------------------------------------------------------

export function validateClip(
  clip: ClipAnnotation,
  allClipIds: Set<string>,
  sourceTotalFrames: number,
  enumDefs: EnumDefinitions = DEFAULT_ENUM_DEFINITIONS,
): ValidationError[] {
  const errors: ValidationError[] = [];
  const obj = clip as unknown as Record<string, unknown>;

  // Required fields — presence check
  for (const field of REQUIRED_FIELDS) {
    const val = getNestedValue(obj, field);
    if (field === 'tags') {
      // tags must be an array (can be empty)
      if (!Array.isArray(val)) {
        errors.push(err(field, 'required', `Required field "${field}" is missing or not an array`));
      }
    } else if (isEmptyValue(val)) {
      errors.push(err(field, 'required', `Required field "${field}" is missing or empty`));
    }
  }

  // Enum validation — status uses CLIP_STATUS_VALUES
  if (clip.status !== undefined && clip.status !== null) {
    if (!(CLIP_STATUS_VALUES as readonly string[]).includes(clip.status as string)) {
      errors.push(err('status', 'enum', `Invalid status value "${clip.status}"`));
    }
  }

  // Enum validation — difficulty, style
  for (const [fieldPath, enumKey] of Object.entries(ENUM_FIELD_MAP)) {
    const val = getNestedValue(obj, fieldPath);
    if (val === undefined || val === null) continue;
    const allowed = enumDefs[enumKey];
    if (!allowed.includes(val as string)) {
      errors.push(err(fieldPath, 'enum', `"${val}" is not a valid value for "${fieldPath}"`));
    }
  }

  // Frame constraints — remotion fields must have valid types/ranges
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
    if (typeof clip.remotion.fps !== 'number' || clip.remotion.fps <= 0) {
      errors.push(
        err('remotion.fps', 'frame_constraints', 'fps must be a positive number'),
      );
    }
  }

  // Frame range — from_frame + duration_in_frames must not exceed sourceTotalFrames
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

  // Clip ID uniqueness
  if (clip.clip_id && allClipIds.has(clip.clip_id)) {
    errors.push(
      err('clip_id', 'unique_clip_id', `clip_id "${clip.clip_id}" is not unique`),
    );
  }

  return errors;
}

// ---------------------------------------------------------------------------
// validateField — validate a single field value (only for required fields)
// ---------------------------------------------------------------------------

export function validateField(
  fieldPath: string,
  value: unknown,
  enumDefs: EnumDefinitions = DEFAULT_ENUM_DEFINITIONS,
): ValidationError | null {
  // Status enum check
  if (fieldPath === 'status') {
    if (value !== undefined && value !== null) {
      if (!(CLIP_STATUS_VALUES as readonly string[]).includes(value as string)) {
        return err('status', 'enum', `Invalid status value "${value}"`);
      }
    }
    return null;
  }

  // Enum check for difficulty, style
  const enumKey = ENUM_FIELD_MAP[fieldPath];
  if (enumKey) {
    if (value === undefined || value === null) return null;
    const allowed = enumDefs[enumKey];
    if (!allowed.includes(value as string)) {
      return err(fieldPath, 'enum', `"${value}" is not a valid value for "${fieldPath}"`);
    }
    return null;
  }

  // Required field check
  if (REQUIRED_FIELDS.includes(fieldPath)) {
    if (fieldPath === 'tags') {
      if (!Array.isArray(value)) {
        return err(fieldPath, 'required', `Required field "${fieldPath}" is missing or not an array`);
      }
      return null;
    }
    if (isEmptyValue(value)) {
      return err(fieldPath, 'required', `Required field "${fieldPath}" is missing or empty`);
    }
  }

  return null;
}
