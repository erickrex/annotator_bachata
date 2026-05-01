import { describe, it, expect } from 'vitest';
import { validateClip, validateField } from './schema-validator.js';
import type { ClipAnnotation } from '../types/index.js';

// ---------------------------------------------------------------------------
// Helper: build a fully valid ClipAnnotation (reduced required fields only)
// ---------------------------------------------------------------------------

function makeValidClip(overrides: Partial<ClipAnnotation> = {}): ClipAnnotation {
  return {
    clip_id: 'src1_c001_008',
    source_id: 'src1',
    status: 'annotated',
    remotion: { from_frame: 0, duration_in_frames: 900, fps: 30 },
    move_name: 'basic step',
    difficulty: 'beginner',
    style: 'traditional',
    tags: ['basic'],
    ...overrides,
  };
}

const EMPTY_IDS = new Set<string>();
const TOTAL_FRAMES = 10000;

// ---------------------------------------------------------------------------
// Required fields (reduced set)
// ---------------------------------------------------------------------------

describe('Required fields (reduced set)', () => {
  it('returns no errors for a valid clip with only required fields', () => {
    const errors = validateClip(makeValidClip(), EMPTY_IDS, TOTAL_FRAMES);
    expect(errors).toHaveLength(0);
  });

  it('returns no errors for a clip with optional fields present', () => {
    const clip = makeValidClip({
      move_label: 'basic',
      energy_level: 'medium',
      estimated_tempo_bpm: 130,
      duration_seconds: 30,
      beats_total: 8,
      bars_total: 2,
      entry_state: {
        hold: 'closed',
        leader_weight_foot: 'left',
        follower_weight_foot: 'right',
      },
      exit_state: {
        hold: 'closed',
        leader_weight_foot: 'right',
        follower_weight_foot: 'left',
      },
      trim_profile: {
        trim_safe_start_seconds: 0,
        trim_safe_end_seconds: 30,
      },
      motion_profile: {},
      camera_profile: {},
      quality_profile: {},
    });
    const errors = validateClip(clip, EMPTY_IDS, TOTAL_FRAMES);
    expect(errors).toHaveLength(0);
  });

  it('reports missing clip_id', () => {
    const clip = makeValidClip({ clip_id: '' });
    const errors = validateClip(clip, EMPTY_IDS, TOTAL_FRAMES);
    expect(errors.some((e) => e.field === 'clip_id' && e.rule === 'required')).toBe(true);
  });

  it('reports missing source_id', () => {
    const clip = makeValidClip({ source_id: '' });
    const errors = validateClip(clip, EMPTY_IDS, TOTAL_FRAMES);
    expect(errors.some((e) => e.field === 'source_id' && e.rule === 'required')).toBe(true);
  });

  it('reports missing status', () => {
    const clip = makeValidClip({ status: '' as any });
    const errors = validateClip(clip, EMPTY_IDS, TOTAL_FRAMES);
    expect(errors.some((e) => e.field === 'status' && e.rule === 'required')).toBe(true);
  });

  it('reports missing move_name', () => {
    const clip = makeValidClip({ move_name: '' });
    const errors = validateClip(clip, EMPTY_IDS, TOTAL_FRAMES);
    expect(errors.some((e) => e.field === 'move_name' && e.rule === 'required')).toBe(true);
  });

  it('reports missing difficulty', () => {
    const clip = makeValidClip({ difficulty: '' as any });
    const errors = validateClip(clip, EMPTY_IDS, TOTAL_FRAMES);
    expect(errors.some((e) => e.field === 'difficulty' && e.rule === 'required')).toBe(true);
  });

  it('reports missing style', () => {
    const clip = makeValidClip({ style: '' as any });
    const errors = validateClip(clip, EMPTY_IDS, TOTAL_FRAMES);
    expect(errors.some((e) => e.field === 'style' && e.rule === 'required')).toBe(true);
  });

  it('reports missing tags (not an array)', () => {
    const clip = makeValidClip({ tags: undefined as any });
    const errors = validateClip(clip, EMPTY_IDS, TOTAL_FRAMES);
    expect(errors.some((e) => e.field === 'tags' && e.rule === 'required')).toBe(true);
  });

  it('accepts empty tags array', () => {
    const clip = makeValidClip({ tags: [] });
    const errors = validateClip(clip, EMPTY_IDS, TOTAL_FRAMES);
    expect(errors.filter((e) => e.field === 'tags')).toHaveLength(0);
  });

  it('reports missing remotion.from_frame', () => {
    const clip = makeValidClip({
      remotion: { from_frame: undefined as any, duration_in_frames: 900, fps: 30 },
    });
    const errors = validateClip(clip, EMPTY_IDS, TOTAL_FRAMES);
    expect(errors.some((e) => e.field === 'remotion.from_frame')).toBe(true);
  });

  it('reports missing remotion.duration_in_frames', () => {
    const clip = makeValidClip({
      remotion: { from_frame: 0, duration_in_frames: undefined as any, fps: 30 },
    });
    const errors = validateClip(clip, EMPTY_IDS, TOTAL_FRAMES);
    expect(errors.some((e) => e.field === 'remotion.duration_in_frames')).toBe(true);
  });

  it('reports missing remotion.fps', () => {
    const clip = makeValidClip({
      remotion: { from_frame: 0, duration_in_frames: 900, fps: undefined as any },
    });
    const errors = validateClip(clip, EMPTY_IDS, TOTAL_FRAMES);
    expect(errors.some((e) => e.field === 'remotion.fps')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Optional fields produce NO validation errors
// ---------------------------------------------------------------------------

describe('Optional fields produce no validation errors', () => {
  it('does not report errors for missing optional fields', () => {
    // A clip with only required fields — no optional fields at all
    const clip = makeValidClip();
    const errors = validateClip(clip, EMPTY_IDS, TOTAL_FRAMES);
    expect(errors).toHaveLength(0);
  });

  it('does not report errors for invalid optional enum values', () => {
    // Optional fields with bad values should NOT produce errors
    const clip = makeValidClip({
      move_label: 'INVALID_LABEL' as any,
      energy_level: 'INVALID_ENERGY' as any,
    });
    const errors = validateClip(clip, EMPTY_IDS, TOTAL_FRAMES);
    expect(errors).toHaveLength(0);
  });

  it('does not report errors for invalid optional numeric values', () => {
    const clip = makeValidClip({
      duration_seconds: -999,
      beats_total: -5,
      bars_total: -1,
    });
    const errors = validateClip(clip, EMPTY_IDS, TOTAL_FRAMES);
    expect(errors).toHaveLength(0);
  });

  it('does not report errors for missing entry_state or exit_state', () => {
    const clip = makeValidClip();
    // No entry_state or exit_state set
    const errors = validateClip(clip, EMPTY_IDS, TOTAL_FRAMES);
    expect(errors).toHaveLength(0);
  });

  it('does not report errors for missing trim_profile', () => {
    const clip = makeValidClip();
    const errors = validateClip(clip, EMPTY_IDS, TOTAL_FRAMES);
    expect(errors).toHaveLength(0);
  });

  it('silently preserves unknown fields', () => {
    const clip = makeValidClip() as any;
    clip.some_unknown_field = 'hello';
    clip.another_field = { nested: true };
    const errors = validateClip(clip, EMPTY_IDS, TOTAL_FRAMES);
    expect(errors).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Enum validation (only for required fields: status, difficulty, style)
// ---------------------------------------------------------------------------

describe('Enum validation (required fields only)', () => {
  it('accepts valid enum values', () => {
    const errors = validateClip(makeValidClip(), EMPTY_IDS, TOTAL_FRAMES);
    expect(errors.filter((e) => e.rule === 'enum')).toHaveLength(0);
  });

  it('rejects invalid status', () => {
    const clip = makeValidClip({ status: 'INVALID' as any });
    const errors = validateClip(clip, EMPTY_IDS, TOTAL_FRAMES);
    expect(errors.some((e) => e.field === 'status' && e.rule === 'enum')).toBe(true);
  });

  it('rejects invalid difficulty', () => {
    const clip = makeValidClip({ difficulty: 'expert' as any });
    const errors = validateClip(clip, EMPTY_IDS, TOTAL_FRAMES);
    expect(errors.some((e) => e.field === 'difficulty' && e.rule === 'enum')).toBe(true);
  });

  it('rejects invalid style', () => {
    const clip = makeValidClip({ style: 'INVALID_STYLE' as any });
    const errors = validateClip(clip, EMPTY_IDS, TOTAL_FRAMES);
    expect(errors.some((e) => e.field === 'style' && e.rule === 'enum')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Frame constraints
// ---------------------------------------------------------------------------

describe('Frame constraints', () => {
  it('passes for valid frame values', () => {
    const errors = validateClip(makeValidClip(), EMPTY_IDS, TOTAL_FRAMES);
    expect(errors.filter((e) => e.rule === 'frame_constraints')).toHaveLength(0);
  });

  it('fails for negative from_frame', () => {
    const clip = makeValidClip({
      remotion: { from_frame: -1, duration_in_frames: 900, fps: 30 },
    });
    const errors = validateClip(clip, EMPTY_IDS, TOTAL_FRAMES);
    expect(errors.some((e) => e.field === 'remotion.from_frame' && e.rule === 'frame_constraints')).toBe(true);
  });

  it('fails for zero duration_in_frames', () => {
    const clip = makeValidClip({
      remotion: { from_frame: 0, duration_in_frames: 0, fps: 30 },
    });
    const errors = validateClip(clip, EMPTY_IDS, TOTAL_FRAMES);
    expect(
      errors.some((e) => e.field === 'remotion.duration_in_frames' && e.rule === 'frame_constraints'),
    ).toBe(true);
  });

  it('fails for non-integer from_frame', () => {
    const clip = makeValidClip({
      remotion: { from_frame: 1.5, duration_in_frames: 900, fps: 30 },
    });
    const errors = validateClip(clip, EMPTY_IDS, TOTAL_FRAMES);
    expect(errors.some((e) => e.field === 'remotion.from_frame' && e.rule === 'frame_constraints')).toBe(true);
  });

  it('fails for zero fps', () => {
    const clip = makeValidClip({
      remotion: { from_frame: 0, duration_in_frames: 900, fps: 0 },
    });
    const errors = validateClip(clip, EMPTY_IDS, TOTAL_FRAMES);
    expect(errors.some((e) => e.field === 'remotion.fps' && e.rule === 'frame_constraints')).toBe(true);
  });

  it('fails for negative fps', () => {
    const clip = makeValidClip({
      remotion: { from_frame: 0, duration_in_frames: 900, fps: -30 },
    });
    const errors = validateClip(clip, EMPTY_IDS, TOTAL_FRAMES);
    expect(errors.some((e) => e.field === 'remotion.fps' && e.rule === 'frame_constraints')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Frame range
// ---------------------------------------------------------------------------

describe('Frame range', () => {
  it('passes when within total frames', () => {
    const clip = makeValidClip({
      remotion: { from_frame: 0, duration_in_frames: 900, fps: 30 },
    });
    const errors = validateClip(clip, EMPTY_IDS, 1000);
    expect(errors.filter((e) => e.rule === 'frame_range')).toHaveLength(0);
  });

  it('fails when exceeding total frames', () => {
    const clip = makeValidClip({
      remotion: { from_frame: 500, duration_in_frames: 600, fps: 30 },
    });
    const errors = validateClip(clip, EMPTY_IDS, 1000);
    expect(errors.some((e) => e.rule === 'frame_range')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Clip ID uniqueness
// ---------------------------------------------------------------------------

describe('Clip ID uniqueness', () => {
  it('passes when clip_id is not in allClipIds', () => {
    const errors = validateClip(makeValidClip(), EMPTY_IDS, TOTAL_FRAMES);
    expect(errors.filter((e) => e.rule === 'unique_clip_id')).toHaveLength(0);
  });

  it('fails when clip_id already exists', () => {
    const existing = new Set(['src1_c001_008']);
    const errors = validateClip(makeValidClip(), existing, TOTAL_FRAMES);
    expect(errors.some((e) => e.rule === 'unique_clip_id')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// All rules checked (not fail-fast)
// ---------------------------------------------------------------------------

describe('All rules checked (not fail-fast)', () => {
  it('collects multiple errors from different rules', () => {
    const clip = makeValidClip({
      clip_id: '', // required
      status: 'INVALID' as any, // enum
      remotion: { from_frame: -1, duration_in_frames: 0, fps: 30 }, // frame_constraints
    });
    const errors = validateClip(clip, EMPTY_IDS, TOTAL_FRAMES);
    const rules = new Set(errors.map((e) => e.rule));
    expect(rules.size).toBeGreaterThanOrEqual(3);
  });
});

// ---------------------------------------------------------------------------
// validateField
// ---------------------------------------------------------------------------

describe('validateField', () => {
  it('returns null for valid enum value (difficulty)', () => {
    expect(validateField('difficulty', 'beginner')).toBeNull();
  });

  it('returns error for invalid enum value (difficulty)', () => {
    const result = validateField('difficulty', 'expert');
    expect(result).not.toBeNull();
    expect(result!.rule).toBe('enum');
  });

  it('returns null for valid status', () => {
    expect(validateField('status', 'annotated')).toBeNull();
  });

  it('returns error for invalid status', () => {
    const result = validateField('status', 'INVALID');
    expect(result).not.toBeNull();
    expect(result!.rule).toBe('enum');
  });

  it('returns error for missing required field', () => {
    const result = validateField('clip_id', '');
    expect(result).not.toBeNull();
    expect(result!.rule).toBe('required');
  });

  it('returns null for unknown field path (optional fields)', () => {
    expect(validateField('some.unknown.path', 'anything')).toBeNull();
  });

  it('returns null for optional field paths', () => {
    // These used to be validated but are now optional
    expect(validateField('move_label', 'INVALID')).toBeNull();
    expect(validateField('energy_level', 'INVALID')).toBeNull();
    expect(validateField('quality_profile.visibility_score', 1.5)).toBeNull();
  });

  it('returns null for valid style enum', () => {
    expect(validateField('style', 'traditional')).toBeNull();
  });

  it('returns error for invalid style enum', () => {
    const result = validateField('style', 'INVALID_STYLE');
    expect(result).not.toBeNull();
    expect(result!.rule).toBe('enum');
  });
});
