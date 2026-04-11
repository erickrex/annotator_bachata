// Feature: clip-slicer-annotator, Property 10: Boundary Adjustment Stays Beat-Aligned
// **Validates: Requirements 5.9**

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { buildCycles } from '../../services/cycle-builder.js';
import { createClips, adjustBoundary } from '../../services/clip-manager.js';

describe('Property 10: Boundary Adjustment Stays Beat-Aligned', () => {
  const beatCount = fc.integer({ min: 32, max: 200 });
  const startTime = fc.float({ min: 0, max: 10, noNaN: true });
  const beatInterval = fc.float({ min: Math.fround(0.3), max: Math.fround(1.0), noNaN: true });
  const fps = fc.integer({ min: 24, max: 60 });

  function makeBeatGridAndCycles(
    count: number,
    start: number,
    interval: number,
    fpsVal: number,
    downbeat: number,
  ) {
    const timestamps = Array.from({ length: count }, (_, i) => start + i * interval);
    const frames = timestamps.map((t) => Math.round(t * fpsVal));
    const hierarchy = buildCycles(frames, timestamps, downbeat);
    return { timestamps, frames, hierarchy, fpsVal };
  }

  const beatGridArb = fc
    .tuple(beatCount, startTime, beatInterval, fps)
    .chain(([count, start, interval, fpsVal]) => {
      const maxDownbeat = Math.min(7, count - 32);
      return fc
        .integer({ min: 0, max: Math.max(0, maxDownbeat) })
        .map((downbeat) => makeBeatGridAndCycles(count, start, interval, fpsVal, downbeat));
    });

  it('adjusted fromFrame corresponds to a position in the beat grid', () => {
    fc.assert(
      fc.property(beatGridArb, (grid) => {
        const clips = createClips('src1', grid.hierarchy, 8, grid.fpsVal);
        if (clips.length === 0) return;

        const beatGridFrames = grid.frames;
        const clip = clips[0];

        // Try adjusting fromFrame to an arbitrary value — it should snap to beat grid
        const arbitraryFrom = clip.remotion.fromFrame + 3;
        const adjusted = adjustBoundary(clip, arbitraryFrom, null, beatGridFrames);

        expect(beatGridFrames).toContain(adjusted.remotion.fromFrame);
      }),
      { numRuns: 100 },
    );
  });

  it('adjusted end frame corresponds to a position in the beat grid', () => {
    fc.assert(
      fc.property(beatGridArb, (grid) => {
        const clips = createClips('src1', grid.hierarchy, 8, grid.fpsVal);
        if (clips.length === 0) return;

        const beatGridFrames = grid.frames;
        const clip = clips[0];
        const currentEnd = clip.remotion.fromFrame + clip.remotion.durationInFrames - 1;

        // Try adjusting endFrame to an arbitrary value — it should snap to beat grid
        const arbitraryEnd = currentEnd + 5;
        const adjusted = adjustBoundary(clip, null, arbitraryEnd, beatGridFrames);

        const adjustedEnd = adjusted.remotion.fromFrame + adjusted.remotion.durationInFrames - 1;
        expect(beatGridFrames).toContain(adjustedEnd);
      }),
      { numRuns: 100 },
    );
  });

  it('both boundaries stay beat-aligned when adjusted simultaneously', () => {
    fc.assert(
      fc.property(beatGridArb, (grid) => {
        const clips = createClips('src1', grid.hierarchy, 8, grid.fpsVal);
        if (clips.length === 0) return;

        const beatGridFrames = grid.frames;
        const clip = clips[0];

        const arbitraryFrom = clip.remotion.fromFrame + 2;
        const currentEnd = clip.remotion.fromFrame + clip.remotion.durationInFrames - 1;
        const arbitraryEnd = currentEnd + 7;

        const adjusted = adjustBoundary(clip, arbitraryFrom, arbitraryEnd, beatGridFrames);

        expect(beatGridFrames).toContain(adjusted.remotion.fromFrame);
        const adjustedEnd = adjusted.remotion.fromFrame + adjusted.remotion.durationInFrames - 1;
        expect(beatGridFrames).toContain(adjustedEnd);
      }),
      { numRuns: 100 },
    );
  });
});
