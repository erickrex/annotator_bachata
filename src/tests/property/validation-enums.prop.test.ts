// Feature: clip-slicer-annotator, Property 18: Enum Field Validation
// **Validates: Requirements 14.2, 14.11**

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { validateClip } from '../../services/schema-validator.js';
import type { ClipAnnotation } from '../../types/index.js';
import {
  HOLD_VALUES,
  WEIGHT_FOOT_VALUES,
  FACING_VALUES,
  RELATIVE_POSITION_VALUES,
  TRAVEL_DIRECTION_VALUES,
  ROTATION_DIRECTION_VALUES,
  DISTANCE_PROFILE_VALUES,
  FRAME_TENSION_VALUES,
  TEMPO_FEEL_VALUES,
  ACCENT_PATTERN_VALUES,
  DIFFICULTY_VALUES,
  ENERGY_LEVEL_VALUES,
  STYLE_VALUES,
  MOVE_LABEL_VALUES,
  TRAVEL_AMOUNT_VALUES,
  FOOTWORK_COMPLEXITY_VALUES,
  UPPER_BODY_ISOLATION_VALUES,
  DOMINANT_MOTION_VALUES,
  CAMERA_ANGLE_VALUES,
  FRAMING_VALUES,
  HAND_CONNECTION_VALUES,
  PHRASE_RESOLUTION_VALUES,
  CLIP_STATUS_VALUES,
} from '../../types/enums.js';

// ---------------------------------------------------------------------------
// Shared helper
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
// Enum field → allowed values mapping (top-level and nested)
// ---------------------------------------------------------------------------

interface EnumFieldDef {
  path: string;
  allowed: readonly string[];
  applyToClip: (clip: ClipAnnotation, value: string) => void;
}

const allEnumValues = new Set<string>([
  ...HOLD_VALUES, ...WEIGHT_FOOT_VALUES, ...FACING_VALUES,
  ...RELATIVE_POSITION_VALUES, ...TRAVEL_DIRECTION_VALUES,
  ...ROTATION_DIRECTION_VALUES, ...DISTANCE_PROFILE_VALUES,
  ...FRAME_TENSION_VALUES, ...TEMPO_FEEL_VALUES, ...ACCENT_PATTERN_VALUES,
  ...DIFFICULTY_VALUES, ...ENERGY_LEVEL_VALUES, ...STYLE_VALUES,
  ...MOVE_LABEL_VALUES, ...TRAVEL_AMOUNT_VALUES, ...FOOTWORK_COMPLEXITY_VALUES,
  ...UPPER_BODY_ISOLATION_VALUES, ...DOMINANT_MOTION_VALUES,
  ...CAMERA_ANGLE_VALUES, ...FRAMING_VALUES, ...HAND_CONNECTION_VALUES,
  ...PHRASE_RESOLUTION_VALUES, ...CLIP_STATUS_VALUES,
]);

// Generator: random string guaranteed NOT to be in any controlled vocabulary
const invalidEnumArb = fc
  .string({ minLength: 1, maxLength: 30 })
  .filter((s) => !allEnumValues.has(s) && s.trim().length > 0);

const ENUM_FIELDS: EnumFieldDef[] = [
  {
    path: 'status',
    allowed: [...CLIP_STATUS_VALUES],
    applyToClip: (c, v) => { (c as any).status = v; },
  },
  {
    path: 'move_label',
    allowed: [...MOVE_LABEL_VALUES],
    applyToClip: (c, v) => { (c as any).move_label = v; },
  },
  {
    path: 'difficulty',
    allowed: [...DIFFICULTY_VALUES],
    applyToClip: (c, v) => { (c as any).difficulty = v; },
  },
  {
    path: 'energy_level',
    allowed: [...ENERGY_LEVEL_VALUES],
    applyToClip: (c, v) => { (c as any).energy_level = v; },
  },
  {
    path: 'style',
    allowed: [...STYLE_VALUES],
    applyToClip: (c, v) => { (c as any).style = v; },
  },
  {
    path: 'phrase_resolution',
    allowed: [...PHRASE_RESOLUTION_VALUES],
    applyToClip: (c, v) => { (c as any).phrase_resolution = v; },
  },
  {
    path: 'entry_state.hold',
    allowed: [...HOLD_VALUES],
    applyToClip: (c, v) => { c.entry_state.hold = v as any; },
  },
  {
    path: 'entry_state.leader_weight_foot',
    allowed: [...WEIGHT_FOOT_VALUES],
    applyToClip: (c, v) => { c.entry_state.leader_weight_foot = v as any; },
  },
  {
    path: 'exit_state.hold',
    allowed: [...HOLD_VALUES],
    applyToClip: (c, v) => { c.exit_state.hold = v as any; },
  },
  {
    path: 'completion_profile.tempo_feel',
    allowed: [...TEMPO_FEEL_VALUES],
    applyToClip: (c, v) => { c.completion_profile.tempo_feel = v as any; },
  },
  {
    path: 'camera_profile.camera_angle',
    allowed: [...CAMERA_ANGLE_VALUES],
    applyToClip: (c, v) => { c.camera_profile = { ...c.camera_profile, camera_angle: v as any }; },
  },
  {
    path: 'camera_profile.framing',
    allowed: [...FRAMING_VALUES],
    applyToClip: (c, v) => { c.camera_profile = { ...c.camera_profile, framing: v as any }; },
  },
  {
    path: 'motion_profile.travel_amount',
    allowed: [...TRAVEL_AMOUNT_VALUES],
    applyToClip: (c, v) => { c.motion_profile = { ...c.motion_profile, travel_amount: v as any }; },
  },
];

describe('Property 18: Enum Field Validation', () => {
  it('a valid clip produces zero enum errors', () => {
    const errors = validateClip(makeValidClip(), EMPTY_IDS, TOTAL_FRAMES);
    expect(errors.filter((e) => e.rule === 'enum')).toHaveLength(0);
  });

  it('setting any enum field to an invalid string produces an enum error', () => {
    const fieldIndexArb = fc.integer({ min: 0, max: ENUM_FIELDS.length - 1 });

    fc.assert(
      fc.property(fieldIndexArb, invalidEnumArb, (fieldIdx, badValue) => {
        const clip = makeValidClip();
        const fieldDef = ENUM_FIELDS[fieldIdx];
        fieldDef.applyToClip(clip, badValue);

        const errors = validateClip(clip, EMPTY_IDS, TOTAL_FRAMES);
        const enumErrors = errors.filter((e) => e.rule === 'enum');

        // At least one enum error should reference this field path
        const hasFieldError = enumErrors.some((e) => e.field === fieldDef.path);
        expect(hasFieldError).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it('invalid hand_connections array element produces a hand_connections_vocab error', () => {
    fc.assert(
      fc.property(invalidEnumArb, (badValue) => {
        const clip = makeValidClip({
          entry_state: {
            hold: 'closed',
            leader_weight_foot: 'left',
            follower_weight_foot: 'right',
            hand_connections: [badValue as any],
          },
        });

        const errors = validateClip(clip, EMPTY_IDS, TOTAL_FRAMES);
        const hcErrors = errors.filter((e) => e.rule === 'hand_connections_vocab');
        expect(hcErrors.length).toBeGreaterThanOrEqual(1);
      }),
      { numRuns: 100 },
    );
  });
});
