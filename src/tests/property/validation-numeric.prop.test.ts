// Feature: codebase-cleanup, Property 3 (partial): Numeric Constraint Validation
// **Validates: Requirements 4.2**
// Only validates numeric constraints on REQUIRED fields (remotion.from_frame,
// remotion.duration_in_frames, remotion.fps). Optional field numeric constraints
// have been removed per the annotation simplification (Requirement 4.2, 4.3).

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
    difficulty: 'beginner',
    style: 'traditional',
    tags: ['basic'],
    ...overrides,
  };
}

const EMPTY_IDS = new Set<string>();
const TOTAL_FRAMES = 10000;

describe('Numeric Constraint Validation (required fields only)', () => {
  // (a) negative from_frame should be rejected
  it('rejects negative from_frame', () => {
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

  // (b) non-positive duration_in_frames should be rejected
  it('rejects non-positive duration_in_frames', () => {
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

  // (c) non-positive fps should be rejected
  it('rejects non-positive fps', () => {
    const nonPosFpsArb = fc.oneof(
      fc.integer({ min: -1000, max: 0 }),
      fc.float({ min: -1000, max: 0, noNaN: true, noDefaultInfinity: true }),
    );

    fc.assert(
      fc.property(nonPosFpsArb, (badFps) => {
        const clip = makeValidClip({
          remotion: { from_frame: 0, duration_in_frames: 900, fps: badFps },
        });
        const errors = validateClip(clip, EMPTY_IDS, TOTAL_FRAMES);
        expect(errors.some((e) => e.field === 'remotion.fps' && e.rule === 'frame_constraints')).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  // (d) optional fields with bad numeric values produce NO errors
  it('does not reject invalid numeric values on optional fields', () => {
    const badNumArb = fc.oneof(
      fc.integer({ min: -10000, max: -1 }),
      fc.float({ min: -1000, max: Math.fround(-0.001), noNaN: true, noDefaultInfinity: true }),
    );

    fc.assert(
      fc.property(badNumArb, (badVal) => {
        const clip = makeValidClip({
          duration_seconds: badVal,
          beats_total: badVal,
          bars_total: badVal,
          estimated_tempo_bpm: badVal,
        });
        const errors = validateClip(clip, EMPTY_IDS, TOTAL_FRAMES);
        // No errors should reference optional fields
        expect(errors).toHaveLength(0);
      }),
      { numRuns: 100 },
    );
  });
});
