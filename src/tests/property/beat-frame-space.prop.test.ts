// Feature: integration-fixes, Property 1: Bug Condition — Beat Markers Are Source-Absolute Instead of Clip-Relative
// **Validates: Requirements 2.8**

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { buildCycles } from '../../services/cycle-builder.js';
import { createClips } from '../../services/clip-manager.js';

describe('Property 1: Bug Condition — Beat Markers Are Source-Absolute Instead of Clip-Relative', () => {
  /**
   * Generator: build a cycle hierarchy where startFrame > 0.
   * We use a non-zero startTime so that beat grid frames are offset from zero,
   * ensuring fromFrame > 0 for generated clips.
   */
  const nonZeroStartBeatGrid = fc
    .tuple(
      fc.integer({ min: 32, max: 120 }),                          // beat count
      fc.float({ min: Math.fround(1.0), max: 30, noNaN: true }), // start time > 0 (ensures fromFrame > 0)
      fc.float({ min: Math.fround(0.3), max: Math.fround(1.0), noNaN: true }), // beat interval
      fc.integer({ min: 24, max: 60 }),                           // fps
    )
    .chain(([count, start, interval, fpsVal]) => {
      const maxDownbeat = Math.min(7, count - 32);
      return fc
        .integer({ min: 0, max: Math.max(0, maxDownbeat) })
        .map((downbeat) => {
          const timestamps = Array.from({ length: count }, (_, i) => start + i * interval);
          const frames = timestamps.map((t) => Math.round(t * fpsVal));
          const hierarchy = buildCycles(frames, timestamps, downbeat);
          return { hierarchy, fpsVal };
        });
    });

  const clipBeatCount = fc.constantFrom(8 as const, 16 as const, 32 as const);

  it('all beatMarkerFrames are clip-relative: in range [0, durationInFrames)', () => {
    fc.assert(
      fc.property(nonZeroStartBeatGrid, clipBeatCount, (grid, bc) => {
        const clips = createClips('src1', grid.hierarchy, bc, grid.fpsVal);

        // Only test clips where fromFrame > 0 (the bug condition)
        const nonZeroClips = clips.filter((c) => c.remotion.fromFrame > 0);

        for (const clip of nonZeroClips) {
          for (const frame of clip.beatMarkerFrames) {
            expect(frame).toBeGreaterThanOrEqual(0);
            expect(frame).toBeLessThan(clip.remotion.durationInFrames);
          }
        }
      }),
      { numRuns: 100 },
    );
  });
});
