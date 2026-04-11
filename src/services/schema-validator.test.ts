import { describe, it, expect } from 'vitest';
import { validateClip, validateField } from './schema-validator.js';
import type { ClipAnnotation } from '../types/index.js';
import { DEFAULT_ENUM_DEFINITIONS } from '../types/enums.js';

// ---------------------------------------------------------------------------
// Helper: build a fully valid ClipAnnotation
// ---------------------------------------------------------------------------

function makeValidClip(overrides: Partial<ClipAnnotation> = {}): ClipAnnotation {
  return {
    clip_id: 'src1_c001_008',
    source_id: 'src1',
    status: 'annotated',
    remotion: { from_frame: 0, duration_in_frames: 900, fps: 30 },
    move_name: 'basic step',
    move_label: 'basic',
    tags: [],
    difficulty: 'beginner',
    energy_level: 'medium',
    style: 'traditional',
    estimated_tempo_bpm: 130,
    duration_seconds: 30,
    beats_total: 8,
    bars_total: 2,
    phrase_resolution: '8_count',
    song_position: {
      start_time_seconds: 0,
      end_time_seconds: 30,
      cycle_number: 1,
      beat_start: 1,
      beat_end: 8,
    },
    completion_profile: {
      basico_completion_counts: 1,
      tempo_feel: 'even_finish',
      accent_pattern: 'even',
      syncopation_level: 0.2,
    },
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
    embedding_refs: {},
    ...overrides,
  };
}

const EMPTY_IDS = new Set<string>();
const TOTAL_FRAMES = 10000;

// ---------------------------------------------------------------------------
// 14.1 — Required fields
// ---------------------------------------------------------------------------

describe('14.1 Required fields', () => {
  it('returns no errors for a fully valid clip', () => {
    const errors = validateClip(makeValidClip(), EMPTY_IDS, TOTAL_FRAMES);
    expect(errors).toHaveLength(0);
  });

  it('reports missing clip_id', () => {
    const clip = makeValidClip({ clip_id: '' });
    const errors = validateClip(clip, EMPTY_IDS, TOTAL_FRAMES);
    expect(errors.some((e) => e.field === 'clip_id' && e.rule === 'required')).toBe(true);
  });

  it('reports missing move_name', () => {
    const clip = makeValidClip({ move_name: '' });
    const errors = validateClip(clip, EMPTY_IDS, TOTAL_FRAMES);
    expect(errors.some((e) => e.field === 'move_name' && e.rule === 'required')).toBe(true);
  });

  it('reports missing entry_state.hold', () => {
    const clip = makeValidClip({
      entry_state: { hold: '' as any, leader_weight_foot: 'left', follower_weight_foot: 'right' },
    });
    const errors = validateClip(clip, EMPTY_IDS, TOTAL_FRAMES);
    expect(errors.some((e) => e.field === 'entry_state.hold' && e.rule === 'required')).toBe(true);
  });

  it('reports missing trim_profile fields', () => {
    const clip = makeValidClip({
      trim_profile: { trim_safe_start_seconds: undefined as any, trim_safe_end_seconds: undefined as any },
    });
    const errors = validateClip(clip, EMPTY_IDS, TOTAL_FRAMES);
    expect(errors.some((e) => e.field === 'trim_profile.trim_safe_start_seconds')).toBe(true);
    expect(errors.some((e) => e.field === 'trim_profile.trim_safe_end_seconds')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 14.2 — Enum validation
// ---------------------------------------------------------------------------

describe('14.2 Enum validation', () => {
  it('accepts valid enum values', () => {
    const errors = validateClip(makeValidClip(), EMPTY_IDS, TOTAL_FRAMES);
    expect(errors.filter((e) => e.rule === 'enum')).toHaveLength(0);
  });

  it('rejects invalid status', () => {
    const clip = makeValidClip({ status: 'INVALID' as any });
    const errors = validateClip(clip, EMPTY_IDS, TOTAL_FRAMES);
    expect(errors.some((e) => e.field === 'status' && e.rule === 'enum')).toBe(true);
  });

  it('rejects invalid move_label', () => {
    const clip = makeValidClip({ move_label: 'NOPE' as any });
    const errors = validateClip(clip, EMPTY_IDS, TOTAL_FRAMES);
    expect(errors.some((e) => e.field === 'move_label' && e.rule === 'enum')).toBe(true);
  });

  it('rejects invalid difficulty', () => {
    const clip = makeValidClip({ difficulty: 'expert' as any });
    const errors = validateClip(clip, EMPTY_IDS, TOTAL_FRAMES);
    expect(errors.some((e) => e.field === 'difficulty' && e.rule === 'enum')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 14.3 — Trim range ordering
// ---------------------------------------------------------------------------

describe('14.3 Trim range ordering', () => {
  it('passes when start < end', () => {
    const errors = validateClip(makeValidClip(), EMPTY_IDS, TOTAL_FRAMES);
    expect(errors.filter((e) => e.rule === 'trim_range_order')).toHaveLength(0);
  });

  it('fails when start >= end', () => {
    const clip = makeValidClip({
      trim_profile: { trim_safe_start_seconds: 10, trim_safe_end_seconds: 5 },
    });
    const errors = validateClip(clip, EMPTY_IDS, TOTAL_FRAMES);
    expect(errors.some((e) => e.rule === 'trim_range_order')).toBe(true);
  });

  it('fails when start == end', () => {
    const clip = makeValidClip({
      trim_profile: { trim_safe_start_seconds: 5, trim_safe_end_seconds: 5 },
    });
    const errors = validateClip(clip, EMPTY_IDS, TOTAL_FRAMES);
    expect(errors.some((e) => e.rule === 'trim_range_order')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 14.4 — Trim end ≤ duration
// ---------------------------------------------------------------------------

describe('14.4 Trim end ≤ duration', () => {
  it('passes when trim end equals duration', () => {
    const clip = makeValidClip({
      duration_seconds: 30,
      trim_profile: { trim_safe_start_seconds: 0, trim_safe_end_seconds: 30 },
    });
    const errors = validateClip(clip, EMPTY_IDS, TOTAL_FRAMES);
    expect(errors.filter((e) => e.rule === 'trim_end_duration')).toHaveLength(0);
  });

  it('fails when trim end exceeds duration', () => {
    const clip = makeValidClip({
      duration_seconds: 30,
      trim_profile: { trim_safe_start_seconds: 0, trim_safe_end_seconds: 31 },
    });
    const errors = validateClip(clip, EMPTY_IDS, TOTAL_FRAMES);
    expect(errors.some((e) => e.rule === 'trim_end_duration')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 14.5 — Beats/bars consistency
// ---------------------------------------------------------------------------

describe('14.5 Beats/bars consistency', () => {
  it('passes when bars_total == beats_total / 4', () => {
    const clip = makeValidClip({ beats_total: 16, bars_total: 4 });
    const errors = validateClip(clip, EMPTY_IDS, TOTAL_FRAMES);
    expect(errors.filter((e) => e.rule === 'beats_bars')).toHaveLength(0);
  });

  it('fails when bars_total != beats_total / 4', () => {
    const clip = makeValidClip({ beats_total: 16, bars_total: 3 });
    const errors = validateClip(clip, EMPTY_IDS, TOTAL_FRAMES);
    expect(errors.some((e) => e.rule === 'beats_bars')).toBe(true);
  });

  it('fails for non-integer beats_total', () => {
    const clip = makeValidClip({ beats_total: 7.5, bars_total: 1.875 });
    const errors = validateClip(clip, EMPTY_IDS, TOTAL_FRAMES);
    expect(errors.some((e) => e.field === 'beats_total' && e.rule === 'beats_bars')).toBe(true);
  });

  it('fails for zero beats_total', () => {
    const clip = makeValidClip({ beats_total: 0, bars_total: 0 });
    const errors = validateClip(clip, EMPTY_IDS, TOTAL_FRAMES);
    expect(errors.some((e) => e.field === 'beats_total' && e.rule === 'beats_bars')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 14.6 — Rotation consistency
// ---------------------------------------------------------------------------

describe('14.6 Rotation consistency', () => {
  it('passes when rotation_direction=none and rotation_degrees=0', () => {
    const clip = makeValidClip({
      entry_state: {
        hold: 'closed',
        leader_weight_foot: 'left',
        follower_weight_foot: 'right',
        rotation_direction: 'none',
        rotation_degrees: 0,
      },
    });
    const errors = validateClip(clip, EMPTY_IDS, TOTAL_FRAMES);
    expect(errors.filter((e) => e.rule === 'rotation_consistency')).toHaveLength(0);
  });

  it('fails when rotation_direction=none but rotation_degrees > 0', () => {
    const clip = makeValidClip({
      entry_state: {
        hold: 'closed',
        leader_weight_foot: 'left',
        follower_weight_foot: 'right',
        rotation_direction: 'none',
        rotation_degrees: 90,
      },
    });
    const errors = validateClip(clip, EMPTY_IDS, TOTAL_FRAMES);
    expect(errors.some((e) => e.rule === 'rotation_consistency')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 14.7 — Travel consistency
// ---------------------------------------------------------------------------

describe('14.7 Travel consistency', () => {
  it('passes when stationary with travel_amount=none', () => {
    const clip = makeValidClip({
      entry_state: {
        hold: 'closed',
        leader_weight_foot: 'left',
        follower_weight_foot: 'right',
        travel_direction: 'stationary',
      },
      motion_profile: { travel_amount: 'none' },
    });
    const errors = validateClip(clip, EMPTY_IDS, TOTAL_FRAMES);
    expect(errors.filter((e) => e.rule === 'travel_consistency')).toHaveLength(0);
  });

  it('passes when stationary with travel_amount=low', () => {
    const clip = makeValidClip({
      entry_state: {
        hold: 'closed',
        leader_weight_foot: 'left',
        follower_weight_foot: 'right',
        travel_direction: 'stationary',
      },
      motion_profile: { travel_amount: 'low' },
    });
    const errors = validateClip(clip, EMPTY_IDS, TOTAL_FRAMES);
    expect(errors.filter((e) => e.rule === 'travel_consistency')).toHaveLength(0);
  });

  it('fails when stationary with travel_amount=high', () => {
    const clip = makeValidClip({
      entry_state: {
        hold: 'closed',
        leader_weight_foot: 'left',
        follower_weight_foot: 'right',
        travel_direction: 'stationary',
      },
      motion_profile: { travel_amount: 'high' },
    });
    const errors = validateClip(clip, EMPTY_IDS, TOTAL_FRAMES);
    expect(errors.some((e) => e.rule === 'travel_consistency')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 14.8 — Float scores range
// ---------------------------------------------------------------------------

describe('14.8 Float scores range', () => {
  it('passes for scores in [0, 1]', () => {
    const clip = makeValidClip({
      quality_profile: {
        visibility_score: 0.5,
        boundary_cleanliness: 1.0,
        teaching_clarity: 0.0,
        stitchability: 0.8,
      },
      completion_profile: {
        basico_completion_counts: 1,
        tempo_feel: 'even_finish',
        accent_pattern: 'even',
        syncopation_level: 0.3,
      },
    });
    const errors = validateClip(clip, EMPTY_IDS, TOTAL_FRAMES);
    expect(errors.filter((e) => e.rule === 'float_range')).toHaveLength(0);
  });

  it('fails for score > 1.0', () => {
    const clip = makeValidClip({
      quality_profile: { visibility_score: 1.5 },
    });
    const errors = validateClip(clip, EMPTY_IDS, TOTAL_FRAMES);
    expect(errors.some((e) => e.rule === 'float_range')).toBe(true);
  });

  it('fails for score < 0.0', () => {
    const clip = makeValidClip({
      quality_profile: { boundary_cleanliness: -0.1 },
    });
    const errors = validateClip(clip, EMPTY_IDS, TOTAL_FRAMES);
    expect(errors.some((e) => e.rule === 'float_range')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 14.9 — Body orientation range
// ---------------------------------------------------------------------------

describe('14.9 Body orientation range', () => {
  it('passes for value in [0, 360]', () => {
    const clip = makeValidClip({
      entry_state: {
        hold: 'closed',
        leader_weight_foot: 'left',
        follower_weight_foot: 'right',
        body_orientation_degrees: 180,
      },
    });
    const errors = validateClip(clip, EMPTY_IDS, TOTAL_FRAMES);
    expect(errors.filter((e) => e.rule === 'body_orientation_range')).toHaveLength(0);
  });

  it('fails for value > 360', () => {
    const clip = makeValidClip({
      entry_state: {
        hold: 'closed',
        leader_weight_foot: 'left',
        follower_weight_foot: 'right',
        body_orientation_degrees: 400,
      },
    });
    const errors = validateClip(clip, EMPTY_IDS, TOTAL_FRAMES);
    expect(errors.some((e) => e.rule === 'body_orientation_range')).toBe(true);
  });

  it('fails for negative value', () => {
    const clip = makeValidClip({
      entry_state: {
        hold: 'closed',
        leader_weight_foot: 'left',
        follower_weight_foot: 'right',
        body_orientation_degrees: -10,
      },
    });
    const errors = validateClip(clip, EMPTY_IDS, TOTAL_FRAMES);
    expect(errors.some((e) => e.rule === 'body_orientation_range')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 14.10 — Spin count
// ---------------------------------------------------------------------------

describe('14.10 Spin count', () => {
  it('passes for non-negative integer', () => {
    const clip = makeValidClip({ motion_profile: { spin_count: 2 } });
    const errors = validateClip(clip, EMPTY_IDS, TOTAL_FRAMES);
    expect(errors.filter((e) => e.rule === 'spin_count')).toHaveLength(0);
  });

  it('passes for zero', () => {
    const clip = makeValidClip({ motion_profile: { spin_count: 0 } });
    const errors = validateClip(clip, EMPTY_IDS, TOTAL_FRAMES);
    expect(errors.filter((e) => e.rule === 'spin_count')).toHaveLength(0);
  });

  it('fails for negative', () => {
    const clip = makeValidClip({ motion_profile: { spin_count: -1 } });
    const errors = validateClip(clip, EMPTY_IDS, TOTAL_FRAMES);
    expect(errors.some((e) => e.rule === 'spin_count')).toBe(true);
  });

  it('fails for non-integer', () => {
    const clip = makeValidClip({ motion_profile: { spin_count: 1.5 } });
    const errors = validateClip(clip, EMPTY_IDS, TOTAL_FRAMES);
    expect(errors.some((e) => e.rule === 'spin_count')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 14.11 — Hand connections vocabulary
// ---------------------------------------------------------------------------

describe('14.11 Hand connections vocabulary', () => {
  it('passes for valid hand connections', () => {
    const clip = makeValidClip({
      entry_state: {
        hold: 'closed',
        leader_weight_foot: 'left',
        follower_weight_foot: 'right',
        hand_connections: ['leader_left_to_follower_right', 'no_hand_connection'],
      },
    });
    const errors = validateClip(clip, EMPTY_IDS, TOTAL_FRAMES);
    expect(errors.filter((e) => e.rule === 'hand_connections_vocab')).toHaveLength(0);
  });

  it('fails for invalid hand connection value', () => {
    const clip = makeValidClip({
      entry_state: {
        hold: 'closed',
        leader_weight_foot: 'left',
        follower_weight_foot: 'right',
        hand_connections: ['invalid_connection' as any],
      },
    });
    const errors = validateClip(clip, EMPTY_IDS, TOTAL_FRAMES);
    expect(errors.some((e) => e.rule === 'hand_connections_vocab')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 14.12 — Clip ID uniqueness
// ---------------------------------------------------------------------------

describe('14.12 Clip ID uniqueness', () => {
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
// 14.13 — Frame constraints
// ---------------------------------------------------------------------------

describe('14.13 Frame constraints', () => {
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
});

// ---------------------------------------------------------------------------
// 14.14 — Frame range
// ---------------------------------------------------------------------------

describe('14.14 Frame range', () => {
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
// 14.15 — Duration consistency
// ---------------------------------------------------------------------------

describe('14.15 Duration consistency', () => {
  it('passes when duration matches frames/fps', () => {
    const clip = makeValidClip({
      remotion: { from_frame: 0, duration_in_frames: 900, fps: 30 },
      duration_seconds: 30,
    });
    const errors = validateClip(clip, EMPTY_IDS, TOTAL_FRAMES);
    expect(errors.filter((e) => e.rule === 'duration_consistency')).toHaveLength(0);
  });

  it('fails when duration deviates beyond tolerance', () => {
    const clip = makeValidClip({
      remotion: { from_frame: 0, duration_in_frames: 900, fps: 30 },
      duration_seconds: 31, // expected 30
    });
    const errors = validateClip(clip, EMPTY_IDS, TOTAL_FRAMES);
    expect(errors.some((e) => e.rule === 'duration_consistency')).toBe(true);
  });

  it('passes within 0.001s tolerance', () => {
    const clip = makeValidClip({
      remotion: { from_frame: 0, duration_in_frames: 900, fps: 30 },
      duration_seconds: 30.0005,
    });
    const errors = validateClip(clip, EMPTY_IDS, TOTAL_FRAMES);
    expect(errors.filter((e) => e.rule === 'duration_consistency')).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 14.16 — All rules checked (not fail-fast)
// ---------------------------------------------------------------------------

describe('14.16 All rules checked (not fail-fast)', () => {
  it('collects multiple errors from different rules', () => {
    const clip = makeValidClip({
      clip_id: '', // 14.1 required
      status: 'INVALID' as any, // 14.2 enum
      remotion: { from_frame: -1, duration_in_frames: 0, fps: 30 }, // 14.13
      beats_total: 0, // 14.5
      bars_total: 0, // 14.5
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
  it('returns null for valid enum value', () => {
    expect(validateField('difficulty', 'beginner')).toBeNull();
  });

  it('returns error for invalid enum value', () => {
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

  it('returns error for float score out of range', () => {
    const result = validateField('quality_profile.visibility_score', 1.5);
    expect(result).not.toBeNull();
    expect(result!.rule).toBe('float_range');
  });

  it('returns null for valid float score', () => {
    expect(validateField('quality_profile.visibility_score', 0.8)).toBeNull();
  });

  it('returns error for missing required field', () => {
    const result = validateField('clip_id', '');
    expect(result).not.toBeNull();
    expect(result!.rule).toBe('required');
  });

  it('returns null for unknown field path', () => {
    expect(validateField('some.unknown.path', 'anything')).toBeNull();
  });
});
