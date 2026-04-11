// Feature: clip-slicer-annotator, Property 19: Numeric Constraint Validation
// **Validates: Requirements 14.3, 14.4, 14.8, 14.9, 14.10, 14.13**

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { validateClip } from '../../services/schema-validator.js';
import type { ClipAnnotation } from '../../types/index.js';

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

describe('Property 19: Numeric Constraint Validation', () => {
  // (a) trim_safe_start >= trim_safe_end should be rejected
  it('(a) rejects trim_safe_start >= trim_safe_end', () => {
    // Generate start >= end by picking end first, then start >= end
    const trimArb = fc
      .tuple(
        fc.float({ min: 0, max: 100, noNaN: true, noDefaultInfinity: true }),
        fc.float({ min: 0, max: 100, noNaN: true, noDefaultInfinity: true }),
      )
      .filter(([a, b]) => a >= b && b >= 0);

    fc.assert(
      fc.property(trimArb, ([start, end]) => {
        const clip = makeValidClip({
          trim_profile: {
            trim_safe_start_seconds: start,
            trim_safe_end_seconds: end,
          },
        });
        const errors = validateClip(clip, EMPTY_IDS, TOTAL_FRAMES);
        expect(errors.some((e) => e.rule === 'trim_range_order')).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  // (b) trim_safe_end > duration should be rejected
  it('(b) rejects trim_safe_end > duration_seconds', () => {
    const arb = fc
      .tuple(
        fc.float({ min: Math.fround(1), max: Math.fround(100), noNaN: true, noDefaultInfinity: true }),
        fc.float({ min: Math.fround(0.01), max: Math.fround(50), noNaN: true, noDefaultInfinity: true }),
      )
      .map(([duration, excess]) => ({
        duration,
        trimEnd: duration + excess,
      }));

    fc.assert(
      fc.property(arb, ({ duration, trimEnd }) => {
        const clip = makeValidClip({
          duration_seconds: duration,
          trim_profile: {
            trim_safe_start_seconds: 0,
            trim_safe_end_seconds: trimEnd,
          },
        });
        const errors = validateClip(clip, EMPTY_IDS, TOTAL_FRAMES);
        expect(errors.some((e) => e.rule === 'trim_end_duration')).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  // (c) float scores outside [0,1] should be rejected
  it('(c) rejects float scores outside [0, 1]', () => {
    const badScoreArb = fc.oneof(
      fc.float({ min: Math.fround(1.001), max: 100, noNaN: true, noDefaultInfinity: true }),
      fc.float({ min: -100, max: Math.fround(-0.001), noNaN: true, noDefaultInfinity: true }),
    );

    const scoreFieldArb = fc.constantFrom(
      'quality_profile.visibility_score',
      'quality_profile.boundary_cleanliness',
      'quality_profile.teaching_clarity',
      'quality_profile.stitchability',
      'completion_profile.syncopation_level',
      'camera_profile.visibility_score',
      'camera_profile.occlusion_score',
    );

    fc.assert(
      fc.property(scoreFieldArb, badScoreArb, (fieldPath, badScore) => {
        const clip = makeValidClip();
        // Set the bad score on the appropriate nested field
        const [section, field] = fieldPath.split('.') as [keyof ClipAnnotation, string];
        (clip[section] as any)[field] = badScore;

        const errors = validateClip(clip, EMPTY_IDS, TOTAL_FRAMES);
        expect(errors.some((e) => e.rule === 'float_range')).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  // (d) body_orientation_degrees outside [0, 360] should be rejected
  it('(d) rejects body_orientation_degrees outside [0, 360]', () => {
    const badDegArb = fc.oneof(
      fc.float({ min: Math.fround(360.001), max: 1000, noNaN: true, noDefaultInfinity: true }),
      fc.float({ min: -1000, max: Math.fround(-0.001), noNaN: true, noDefaultInfinity: true }),
    );

    const stateKeyArb = fc.constantFrom('entry_state' as const, 'exit_state' as const);

    fc.assert(
      fc.property(stateKeyArb, badDegArb, (stateKey, badDeg) => {
        const clip = makeValidClip();
        clip[stateKey] = {
          ...clip[stateKey],
          body_orientation_degrees: badDeg,
        };

        const errors = validateClip(clip, EMPTY_IDS, TOTAL_FRAMES);
        expect(errors.some((e) => e.rule === 'body_orientation_range')).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  // (e) negative spin_count should be rejected
  it('(e) rejects negative spin_count', () => {
    const negSpinArb = fc.integer({ min: -1000, max: -1 });

    fc.assert(
      fc.property(negSpinArb, (badSpin) => {
        const clip = makeValidClip({
          motion_profile: { spin_count: badSpin },
        });
        const errors = validateClip(clip, EMPTY_IDS, TOTAL_FRAMES);
        expect(errors.some((e) => e.rule === 'spin_count')).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  // (f) negative from_frame should be rejected
  it('(f) rejects negative from_frame', () => {
    const negFrameArb = fc.integer({ min: -10000, max: -1 });

    fc.assert(
      fc.property(negFrameArb, (badFrame) => {
        const clip = makeValidClip({
          remotion: { from_frame: badFrame, duration_in_frames: 900, fps: 30 },
        });
        const errors = validateClip(clip, EMPTY_IDS, TOTAL_FRAMES);
        expect(errors.some((e) => e.field === 'remotion.from_frame' && e.rule === 'frame_constraints')).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  // (g) non-positive duration_in_frames should be rejected
  it('(g) rejects non-positive duration_in_frames', () => {
    const nonPosArb = fc.integer({ min: -10000, max: 0 });

    fc.assert(
      fc.property(nonPosArb, (badDuration) => {
        const clip = makeValidClip({
          remotion: { from_frame: 0, duration_in_frames: badDuration, fps: 30 },
        });
        const errors = validateClip(clip, EMPTY_IDS, TOTAL_FRAMES);
        expect(
          errors.some((e) => e.field === 'remotion.duration_in_frames' && e.rule === 'frame_constraints'),
        ).toBe(true);
      }),
      { numRuns: 100 },
    );
  });
});
