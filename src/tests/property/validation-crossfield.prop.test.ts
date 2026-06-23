// Feature: clip-slicer-annotator, Property 20: Cross-Field Consistency Validation
// **Validates: Requirements 14.5, 14.6, 14.7, 14.14, 14.15**

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { validateClip } from '../../services/schema-validator.js';
import type { ClipAnnotation, DancerState } from '../../types/index.js';

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
    ...overrides,
  };
}

const EMPTY_IDS = new Set<string>();
const TOTAL_FRAMES = 10000;

describe('Property 20: Cross-Field Consistency Validation', () => {
  // (a) bars_total != beats_total / 4 — now optional, no longer validated
  it('(a) accepts bars_total != beats_total / 4 (optional fields not validated)', () => {
    // Generate beats as a positive multiple of 4, then pick a wrong bars value
    const arb = fc
      .integer({ min: 1, max: 100 })
      .chain((multiplier) => {
        const beats = multiplier * 4;
        const correctBars = multiplier;
        // Pick a bars value that is NOT correct
        return fc
          .integer({ min: 1, max: 200 })
          .filter((bars) => bars !== correctBars)
          .map((wrongBars) => ({ beats, wrongBars }));
      });

    fc.assert(
      fc.property(arb, ({ beats, wrongBars }) => {
        const clip = makeValidClip({
          beats_total: beats,
          bars_total: wrongBars,
        });
        const errors = validateClip(clip, EMPTY_IDS, TOTAL_FRAMES);
        // Optional field cross-checks are no longer validated
        expect(errors.some((e) => e.rule === 'beats_bars')).toBe(false);
      }),
      { numRuns: 100 },
    );
  });

  // (b) rotation_direction=="none" with rotation_degrees!=0 — now optional, no longer validated
  it('(b) accepts rotation_direction=none with rotation_degrees!=0 (optional fields not validated)', () => {
    const nonZeroDegArb = fc.integer({ min: 1, max: 360 });
    const stateKeyArb = fc.constantFrom('entry_state' as const, 'exit_state' as const);

    fc.assert(
      fc.property(stateKeyArb, nonZeroDegArb, (stateKey, deg) => {
        const clip = makeValidClip();
        // makeValidClip always populates entry_state/exit_state; capture the
        // base state as a non-optional DancerState so the spread result still
        // satisfies DancerState's required fields (e.g. `hold`).
        const baseState: DancerState = clip[stateKey]!;
        clip[stateKey] = {
          ...baseState,
          rotation_direction: 'none',
          rotation_degrees: deg,
        };

        const errors = validateClip(clip, EMPTY_IDS, TOTAL_FRAMES);
        // Optional field cross-checks are no longer validated
        expect(errors.some((e) => e.rule === 'rotation_consistency')).toBe(false);
      }),
      { numRuns: 100 },
    );
  });

  // (c) travel_direction=="stationary" with travel_amount not in {none, low} — now optional, no longer validated
  it('(c) accepts stationary travel_direction with travel_amount not in {none, low} (optional fields not validated)', () => {
    const badTravelAmountArb = fc.constantFrom('medium' as const, 'high' as const);
    const stateKeyArb = fc.constantFrom('entry_state' as const, 'exit_state' as const);

    fc.assert(
      fc.property(stateKeyArb, badTravelAmountArb, (stateKey, badAmount) => {
        const clip = makeValidClip();
        // makeValidClip always populates entry_state/exit_state; capture the
        // base state as a non-optional DancerState so the spread result still
        // satisfies DancerState's required fields (e.g. `hold`).
        const baseState: DancerState = clip[stateKey]!;
        clip[stateKey] = {
          ...baseState,
          travel_direction: 'stationary',
        };
        clip.motion_profile = { ...clip.motion_profile, travel_amount: badAmount };

        const errors = validateClip(clip, EMPTY_IDS, TOTAL_FRAMES);
        // Optional field cross-checks are no longer validated
        expect(errors.some((e) => e.rule === 'travel_consistency')).toBe(false);
      }),
      { numRuns: 100 },
    );
  });

  // (d) from_frame + duration_in_frames > total frames should be rejected
  it('(d) rejects from_frame + duration_in_frames > sourceTotalFrames', () => {
    const arb = fc
      .tuple(
        fc.integer({ min: 0, max: 5000 }),
        fc.integer({ min: 1, max: 5000 }),
        fc.integer({ min: 1, max: 5000 }),
      )
      .filter(([fromFrame, durationFrames, totalFrames]) => fromFrame + durationFrames > totalFrames);

    fc.assert(
      fc.property(arb, ([fromFrame, durationFrames, totalFrames]) => {
        const fps = 30;
        const clip = makeValidClip({
          remotion: { from_frame: fromFrame, duration_in_frames: durationFrames, fps },
          // Keep duration_seconds consistent to avoid extra errors
          duration_seconds: durationFrames / fps,
        });
        const errors = validateClip(clip, EMPTY_IDS, totalFrames);
        expect(errors.some((e) => e.rule === 'frame_range')).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  // (e) |duration_seconds - duration_in_frames/fps| > 0.001 — now optional, no longer validated
  it('(e) accepts duration_seconds inconsistent with duration_in_frames/fps (optional fields not validated)', () => {
    const arb = fc
      .tuple(
        fc.integer({ min: 1, max: 5000 }),
        fc.integer({ min: 1, max: 60 }),
        fc.float({ min: Math.fround(0.01), max: 10, noNaN: true, noDefaultInfinity: true }),
      )
      .map(([durationFrames, fps, deviation]) => {
        const expected = durationFrames / fps;
        // Ensure deviation is large enough to exceed 0.001 tolerance
        const actualDeviation = Math.abs(deviation) < 0.002 ? 0.002 : Math.abs(deviation);
        const wrongDuration = expected + actualDeviation;
        return { durationFrames, fps, wrongDuration };
      });

    fc.assert(
      fc.property(arb, ({ durationFrames, fps, wrongDuration }) => {
        const clip = makeValidClip({
          remotion: { from_frame: 0, duration_in_frames: durationFrames, fps },
          duration_seconds: wrongDuration,
          // Fix trim to avoid extra errors
          trim_profile: {
            trim_safe_start_seconds: 0,
            trim_safe_end_seconds: wrongDuration,
          },
        });
        const errors = validateClip(clip, EMPTY_IDS, TOTAL_FRAMES);
        // Optional field cross-checks are no longer validated
        expect(errors.some((e) => e.rule === 'duration_consistency')).toBe(false);
      }),
      { numRuns: 100 },
    );
  });
});
