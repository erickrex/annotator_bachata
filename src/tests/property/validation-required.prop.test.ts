// Feature: clip-slicer-annotator, Property 17: Required Fields Validation
// **Validates: Requirements 14.1**

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { validateClip } from '../../services/schema-validator.js';
import type { ClipAnnotation } from '../../types/index.js';

// ---------------------------------------------------------------------------
// Shared helper: build a fully valid ClipAnnotation
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
// Required field dot-paths (must match schema-validator.ts REQUIRED_FIELDS)
// ---------------------------------------------------------------------------

const REQUIRED_FIELDS = [
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
] as const;

/** Set a dot-path on an object to a given value. */
function setNestedValue(obj: Record<string, unknown>, dotPath: string, value: unknown): void {
  const keys = dotPath.split('.');
  let current: Record<string, unknown> = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    if (current[keys[i]] == null || typeof current[keys[i]] !== 'object') {
      current[keys[i]] = {};
    }
    current = current[keys[i]] as Record<string, unknown>;
  }
  current[keys[keys.length - 1]] = value;
}

// Generator: pick a non-empty subset of required fields to remove/empty
const requiredFieldSubsetArb = fc
  .subarray([...REQUIRED_FIELDS], { minLength: 1 })
  .filter((arr) => arr.length > 0);

// Generator: choose how to "remove" a field — set to undefined, null, or empty string
const emptyValueArb = fc.constantFrom(undefined, null, '');

describe('Property 17: Required Fields Validation', () => {
  it('a valid clip produces zero required-field errors', () => {
    const errors = validateClip(makeValidClip(), EMPTY_IDS, TOTAL_FRAMES);
    expect(errors.filter((e) => e.rule === 'required')).toHaveLength(0);
  });

  it('removing any subset of required fields produces at least one error per removed field', () => {
    fc.assert(
      fc.property(requiredFieldSubsetArb, emptyValueArb, (fieldsToRemove, emptyVal) => {
        const clip = makeValidClip();
        const obj = clip as unknown as Record<string, unknown>;

        for (const field of fieldsToRemove) {
          setNestedValue(obj, field, emptyVal);
        }

        const errors = validateClip(clip, EMPTY_IDS, TOTAL_FRAMES);
        const requiredErrors = errors.filter((e) => e.rule === 'required');

        // Each removed field should produce at least one required error
        for (const field of fieldsToRemove) {
          const hasError = requiredErrors.some((e) => e.field === field);
          expect(hasError).toBe(true);
        }
      }),
      { numRuns: 100 },
    );
  });
});
